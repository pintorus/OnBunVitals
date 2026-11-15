using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.ServiceProcess;
using System.Text;
using System.Windows.Forms;

namespace Onbun.Fps.Setup {
    internal static class Program {
        const string Service="OnbunFpsCollector";
        static readonly string Root=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),"Onbun FPS Collector");
        [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr OpenSCManager(string machine,string database,uint access);
        [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr OpenService(IntPtr manager,string name,uint access);
        [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateService(IntPtr manager,string name,string display,uint access,uint type,uint start,uint error,string binary,string group,IntPtr tag,string dependencies,string account,string password);
        [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool ChangeServiceConfig(IntPtr service,uint type,uint start,uint error,string binary,string group,IntPtr tag,string dependencies,string account,string password,string display);
        [DllImport("advapi32.dll",SetLastError=true)] static extern bool QueryServiceConfig(IntPtr service,IntPtr config,int size,out int required);
        [DllImport("advapi32.dll",SetLastError=true)] static extern bool SetServiceObjectSecurity(IntPtr service,uint information,IntPtr descriptor);
        [DllImport("advapi32.dll",SetLastError=true)] static extern bool DeleteService(IntPtr service);
        [DllImport("advapi32.dll")] static extern bool CloseServiceHandle(IntPtr service);
        [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool ConvertStringSecurityDescriptorToSecurityDescriptor(string sddl,uint revision,out IntPtr descriptor,out uint size);
        [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool ChangeServiceConfig2(IntPtr service,uint level,ref Privileges privileges);
        [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr memory);
        [StructLayout(LayoutKind.Sequential)] struct Privileges { internal IntPtr Names; }
        [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct Configuration {
            internal uint Type,Start,Error; internal string Binary,Group; internal uint Tag; internal string Dependencies,Account,Display;
        }
        static void Check(bool ok) { if(!ok) throw new Win32Exception(Marshal.GetLastWin32Error()); }
        static void NoLinks(string directory) {
            if(!Directory.Exists(directory)) return;
            if((File.GetAttributes(directory)&FileAttributes.ReparsePoint)!=0) throw new IOException("The collector directory is a link.");
            foreach(string child in Directory.GetDirectories(directory)) NoLinks(child);
        }
        static string BinaryPath(IntPtr service) {
            int required; IntPtr buffer=Marshal.AllocHGlobal(32768);
            try { Check(QueryServiceConfig(service,buffer,32768,out required)); return ((Configuration)Marshal.PtrToStructure(buffer,typeof(Configuration))).Binary; }
            finally { Marshal.FreeHGlobal(buffer); }
        }
        static void CheckExisting(IntPtr service) {
            string binary=BinaryPath(service);
            if(!binary.StartsWith("\""+Root+"\\",StringComparison.OrdinalIgnoreCase) || !binary.EndsWith("\\OnbunFpsCollector.exe\" --service",StringComparison.OrdinalIgnoreCase))
                throw new IOException("A different service already uses this name. It was not changed.");
        }
        static void StopExisting() {
            using(var service=new ServiceController(Service)) {
                if(service.Status==ServiceControllerStatus.Stopped) return;
                service.Stop(); service.WaitForStatus(ServiceControllerStatus.Stopped,TimeSpan.FromSeconds(15));
            }
        }
        static void ProtectDirectory() {
            Directory.CreateDirectory(Root);
            var acl=new DirectorySecurity(); acl.SetAccessRuleProtection(true,false);
            var administrators=new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid,null);
            acl.SetOwner(administrators);
            foreach(var sid in new[]{administrators,new SecurityIdentifier(WellKnownSidType.LocalSystemSid,null)})
                acl.AddAccessRule(new FileSystemAccessRule(sid,FileSystemRights.FullControl,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));
            acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(WellKnownSidType.BuiltinUsersSid,null),FileSystemRights.ReadAndExecute,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));
            acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(WellKnownSidType.LocalServiceSid,null),FileSystemRights.ReadAndExecute,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));
            Directory.SetAccessControl(Root,acl);
        }
        static void Extract(string resource,string file,string expectedHash) {
            byte[] content;
            using(var input=Assembly.GetExecutingAssembly().GetManifestResourceStream(resource))
            using(var memory=new MemoryStream()) { if(input==null) throw new IOException("Missing payload."); input.CopyTo(memory); content=memory.ToArray(); }
            using(var hash=SHA256.Create()) {
                string actual=BitConverter.ToString(hash.ComputeHash(content)).Replace("-","").ToLowerInvariant();
                if(expectedHash!=null && actual!=expectedHash) throw new IOException("Collector payload verification failed.");
                if(File.Exists(file)) {
                    string existing=BitConverter.ToString(hash.ComputeHash(File.ReadAllBytes(file))).Replace("-","").ToLowerInvariant();
                    if(existing==actual) return;
                    throw new IOException("An existing version has different contents. It was not overwritten.");
                }
            }
            using(var output=new FileStream(file,FileMode.CreateNew,FileAccess.Write,FileShare.None)) output.Write(content,0,content.Length);
        }
        static void Install() {
            NoLinks(Root); ProtectDirectory();
            string version=Payload.Version+"-"+Payload.CollectorHash.Substring(0,12);
            string folder=Path.Combine(Root,version); Directory.CreateDirectory(folder);
            Extract("Collector",Path.Combine(folder,"OnbunFpsCollector.exe"),Payload.CollectorHash);
            Extract("PresentMon",Path.Combine(folder,"PresentMon.exe"),Payload.PresentMonHash);
            Extract("License",Path.Combine(folder,"PresentMon-LICENSE.txt"),null);
            IntPtr manager=OpenSCManager(null,null,3); if(manager==IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
            IntPtr service=IntPtr.Zero;
            try {
                service=OpenService(manager,Service,0xF01FF);
                string binary="\""+Path.Combine(folder,"OnbunFpsCollector.exe")+"\" --service";
                if(service!=IntPtr.Zero) {
                    CheckExisting(service); StopExisting();
                    Check(ChangeServiceConfig(service,0x10,3,1,binary,null,IntPtr.Zero,null,"NT AUTHORITY\\LocalService",null,"Onbun FPS Collector"));
                } else {
                    if(Marshal.GetLastWin32Error()!=1060) throw new Win32Exception(Marshal.GetLastWin32Error());
                    service=CreateService(manager,Service,"Onbun FPS Collector",0xF01FF,0x10,3,1,binary,null,IntPtr.Zero,null,"NT AUTHORITY\\LocalService",null);
                    if(service==IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
                }
                IntPtr descriptor; uint size;
                // Interactive users can query/start this fixed service, never change its binary,
                // privileges, security, startup arguments or stop another user's capture.
                Check(ConvertStringSecurityDescriptorToSecurityDescriptor("D:P(A;;GA;;;SY)(A;;GA;;;BA)(A;;CCLCRP;;;IU)",1,out descriptor,out size));
                try { Check(SetServiceObjectSecurity(service,4,descriptor)); } finally { LocalFree(descriptor); }
                var privileges=new Privileges { Names=Marshal.StringToHGlobalUni("SeChangeNotifyPrivilege\0SeImpersonatePrivilege\0\0") };
                try { Check(ChangeServiceConfig2(service,6,ref privileges)); } finally { Marshal.FreeHGlobal(privileges.Names); }
            } finally { if(service!=IntPtr.Zero) CloseServiceHandle(service); CloseServiceHandle(manager); }
            // A protected manifest lets the normal client locate exactly this installed version.
            string metadata="{\"version\":\""+version+"\",\"sha256\":\""+Payload.CollectorHash+"\"}";
            File.WriteAllText(Path.Combine(Root,"collector.json"),metadata,new UTF8Encoding(false));
            // Demand-start only. Installation itself performs no capture and does not start it.
        }
        static void Uninstall() {
            NoLinks(Root);
            IntPtr manager=OpenSCManager(null,null,1); if(manager==IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
            IntPtr service=OpenService(manager,Service,0xF01FF);
            try {
                if(service!=IntPtr.Zero) { CheckExisting(service); StopExisting(); Check(DeleteService(service)); }
                else if(Marshal.GetLastWin32Error()!=1060) throw new Win32Exception(Marshal.GetLastWin32Error());
            } finally { if(service!=IntPtr.Zero) CloseServiceHandle(service); CloseServiceHandle(manager); }
            string metadata=Path.Combine(Root,"collector.json");
            if(File.Exists(metadata)) File.Delete(metadata);
            // Root is the fixed, resolved Program Files target verified above; never caller input.
            if(Directory.Exists(Root)) Directory.Delete(Root,true);
        }
        [STAThread] static int Main(string[] args) {
            if(args.Length>1 || (args.Length==1 && args[0]!="--uninstall")) return 2;
            try { if(args.Length==1) Uninstall(); else Install(); return 0; }
            catch(Exception error) { MessageBox.Show("The Onbun FPS collector could not be configured.\n\n"+error.Message,"Onbun FPS setup",MessageBoxButtons.OK,MessageBoxIcon.Error); return 1; }
        }
    }
}
