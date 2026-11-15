using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.ServiceProcess;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

namespace Onbun.Fps {
    internal static class Native {
        [DllImport("user32.dll")] internal static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] internal static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
        [DllImport("kernel32.dll", SetLastError=true)] internal static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
        [DllImport("advapi32.dll", SetLastError=true)] internal static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
        [DllImport("kernel32.dll")] internal static extern bool CloseHandle(IntPtr handle);
        internal static string ReadLine(Stream stream,int limit,int timeout) {
            var input=new byte[limit]; int count=0; long began=Engine.Now;
            while(count<limit) {
                int remaining=timeout-(int)(Engine.Now-began);
                if(remaining<=0) throw new IOException("Collector timeout");
                var read=stream.ReadAsync(input,count,limit-count);
                if(!read.Wait(remaining) || read.Result==0) throw new IOException("Incomplete collector message");
                int end=count+read.Result;
                for(int i=count;i<end;i++) if(input[i]==10) return Encoding.UTF8.GetString(input,0,i).Trim();
                count=end;
            }
            throw new IOException("Collector message too large");
        }
        internal static bool Owns(int pid, SecurityIdentifier sid) {
            IntPtr process = OpenProcess(0x1000, false, pid), token = IntPtr.Zero;
            if (process == IntPtr.Zero) return false;
            try {
                if (!OpenProcessToken(process, 8, out token)) return false;
                using (var owner = new WindowsIdentity(token)) return owner.User.Equals(sid);
            } finally { if (token != IntPtr.Zero) CloseHandle(token); CloseHandle(process); }
        }
    }

    // Eight 250-ms aggregate buckets per swap chain: no individual frame history or per-frame JSON.
    internal sealed class Frames {
        sealed class Chain {
            internal readonly double[] Sums = new double[8];
            internal readonly long[] Buckets = new long[8];
            internal readonly int[] Counts = new int[8];
        }
        readonly Dictionary<string, Chain> chains = new Dictionary<string, Chain>();
        int intervalIndex = -1, chainIndex = -1;
        internal void Reset() { chains.Clear(); intervalIndex = chainIndex = -1; }
        internal static string[] Csv(string line) {
            var result = new List<string>(); var part = new StringBuilder(); bool quote = false;
            for (int i=0; i<line.Length; i++) {
                char c = line[i];
                if (c=='"') { if (quote && i+1<line.Length && line[i+1]=='"') { part.Append('"'); i++; } else quote=!quote; }
                else if (c==',' && !quote) { result.Add(part.ToString()); part.Clear(); }
                else part.Append(c);
            }
            if (quote) return null;
            result.Add(part.ToString()); return result.ToArray();
        }
        internal void Add(string line, long now) {
            if (line.Length>16384) return;
            string[] row = Csv(line.TrimStart('\uFEFF'));
            if (row == null) return;
            if (intervalIndex<0) {
                for (int i=0; i<row.Length; i++) {
                    if (String.Equals(row[i], "msBetweenPresents", StringComparison.OrdinalIgnoreCase)) intervalIndex=i;
                    if (String.Equals(row[i], "SwapChainAddress", StringComparison.OrdinalIgnoreCase)) chainIndex=i;
                }
                return;
            }
            double interval;
            if (chainIndex<0 || Math.Max(intervalIndex,chainIndex)>=row.Length ||
                !Double.TryParse(row[intervalIndex], NumberStyles.Float, CultureInfo.InvariantCulture, out interval) ||
                Double.IsNaN(interval) || Double.IsInfinity(interval) || interval<=0 || interval>60000) return;
            string address=row[chainIndex];
            Chain chain;
            if (!chains.TryGetValue(address,out chain)) {
                if (chains.Count>=16) return;
                chain=new Chain(); chains.Add(address,chain);
            }
            long bucket=now/250; int at=(int)(bucket%8);
            if(chain.Buckets[at]!=bucket) { chain.Buckets[at]=bucket; chain.Counts[at]=0; chain.Sums[at]=0; }
            chain.Sums[at]+=interval; chain.Counts[at]++;
        }
        internal double? Read(long now) {
            double? value=null; int most=0;
            foreach (var chain in chains.Values) {
                double sum=0; int count=0;
                long firstBucket=now/250-7;
                for(int at=0;at<8;at++) if(chain.Buckets[at]>=firstBucket) { sum+=chain.Sums[at]; count+=chain.Counts[at]; }
                if (count>=2 && count>most) { most=count; value=1000*count/sum; }
            }
            return value.HasValue && value.Value<=2000 ? value : null;
        }
    }

    internal sealed class Engine : IDisposable {
        readonly object sync=new object();
        readonly Frames frames=new Frames();
        readonly List<Task> cleanupTasks=new List<Task>();
        Process capture;
        string session, name="", failure="", targetOwner="";
        int target;
        long lease, retry, lastSwitch;
        bool disposed;
        internal static long Now { get { return Stopwatch.GetTimestamp()*1000/Stopwatch.Frequency; } }
        internal Dictionary<string,object> Query(int pid,string owner) {
            lock(sync) {
                if(disposed) return new Dictionary<string,object>{{"fps",null},{"app",""},{"error","service"}};
                if(target>0 && owner!=targetOwner && Now-lease<3000)
                    return new Dictionary<string,object>{{"fps",null},{"app",""},{"error","busy"}};
                lease=Now;
                if (target!=pid || targetOwner!=owner) {
                    if(Now-lastSwitch<750) return new Dictionary<string,object>{{"fps",null},{"app",""},{"error",""}};
                    StopCapture(); target=pid; targetOwner=owner; name=""; retry=0; failure=""; lastSwitch=Now;
                }
                if (pid>0 && capture==null && Now>=retry) StartCapture(pid);
                double? value=frames.Read(Now);
                return new Dictionary<string,object> { {"fps",value}, {"app",name}, {"error",failure} };
            }
        }
        internal bool Idle { get { lock(sync) return Now-lease>15000; } }
        void StartCapture(int pid) {
            try {
                using(var process=Process.GetProcessById(pid)) name=process.ProcessName+".exe";
                if (String.Equals(name,"explorer.exe",StringComparison.OrdinalIgnoreCase) || String.Equals(name,"dwm.exe",StringComparison.OrdinalIgnoreCase)) return;
                session="OnbunFps-"+Guid.NewGuid().ToString("N"); frames.Reset(); failure="";
                var child=new Process { StartInfo=new ProcessStartInfo {
                    FileName=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"PresentMon.exe"),
                    Arguments="--process_id "+pid.ToString(CultureInfo.InvariantCulture)+" --output_stdout --v1_metrics --no_console_stats --no_track_gpu --no_track_display --no_track_input --session_name "+session+" --timed 60 --terminate_after_timed",
                    UseShellExecute=false, CreateNoWindow=true, RedirectStandardOutput=true, RedirectStandardError=true
                }, EnableRaisingEvents=true };
                child.OutputDataReceived+=(s,e)=> { if (e.Data!=null) lock(sync) { if(capture==child) frames.Add(e.Data,Now); } };
                child.ErrorDataReceived+=(s,e)=> { if(e.Data!=null && e.Data.IndexOf("access denied",StringComparison.OrdinalIgnoreCase)>=0) lock(sync) { if(capture==child) failure="permission"; } };
                child.Exited+=(s,e)=> { lock(sync) { if(capture!=child) return; capture=null; frames.Reset(); if(child.ExitCode!=0) { if(failure=="") failure="capture"; retry=Now+60000; } } child.Dispose(); };
                capture=child;
                child.Start(); child.BeginOutputReadLine(); child.BeginErrorReadLine();
            } catch { capture=null; failure="capture"; retry=Now+60000; }
        }
        void StopCapture() {
            var child=capture; capture=null; frames.Reset();
            if(child==null) return;
            string oldSession=session;
            // Cleanup is asynchronous so switching windows never blocks a pipe response.
            cleanupTasks.RemoveAll(task=>task.IsCompleted);
            cleanupTasks.Add(Task.Run(()=> {
                try {
                    using(var cleanup=Process.Start(new ProcessStartInfo {
                        FileName=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"PresentMon.exe"),
                        Arguments="--session_name "+oldSession+" --terminate_existing_session",
                        UseShellExecute=false,CreateNoWindow=true
                    })) { if(!cleanup.WaitForExit(2000)) cleanup.Kill(); }
                } catch {}
                try { if(!child.HasExited) child.Kill(); child.Dispose(); } catch {}
            }));
        }
        public void Dispose() {
            Task[] pending;
            lock(sync) { if(disposed) return; disposed=true; StopCapture(); pending=cleanupTasks.ToArray(); }
            try { Task.WaitAll(pending,3000); } catch {}
        }
    }

    internal sealed class CollectorService : ServiceBase {
        internal const string Name="OnbunFpsCollector", Pipe="Onbun.Fps.v1";
        readonly Engine engine=new Engine();
        readonly List<NamedPipeServerStream> pipes=new List<NamedPipeServerStream>();
        System.Threading.Timer idle;
        volatile bool stopping;
        internal CollectorService() { ServiceName=Name; CanStop=true; CanShutdown=true; AutoLog=false; }
        protected override void OnStart(string[] ignored) {
            // All service-start arguments are deliberately ignored.
            for(int i=0;i<2;i++) Task.Run((Action)Listen);
            idle=new System.Threading.Timer(_=> { if(engine.Idle && !stopping) Stop(); },null,20000,5000);
        }
        internal static PipeSecurity Permissions() {
            var security=new PipeSecurity(); security.SetAccessRuleProtection(true,false);
            security.AddAccessRule(new PipeAccessRule(new SecurityIdentifier(WellKnownSidType.NetworkSid,null),PipeAccessRights.FullControl,AccessControlType.Deny));
            foreach(var type in new[]{WellKnownSidType.LocalSystemSid,WellKnownSidType.LocalServiceSid})
                security.AddAccessRule(new PipeAccessRule(new SecurityIdentifier(type,null),PipeAccessRights.FullControl,AccessControlType.Allow));
            security.AddAccessRule(new PipeAccessRule(new SecurityIdentifier(WellKnownSidType.InteractiveSid,null),PipeAccessRights.ReadWrite,AccessControlType.Allow));
            return security;
        }
        internal static bool Authorize(NamedPipeServerStream pipe,int pid) {
            if(pid<0) return false;
            bool allowed=false;
            pipe.RunAsClient(()=> {
                using(var identity=WindowsIdentity.GetCurrent()) allowed=pid==0 || Native.Owns(pid,identity.User);
            });
            return allowed;
        }
        internal static string ClientSid(NamedPipeServerStream pipe) {
            string sid="";
            pipe.RunAsClient(()=> { using(var identity=WindowsIdentity.GetCurrent()) sid=identity.User.Value; });
            return sid;
        }
        void Listen() {
            while(!stopping) {
                NamedPipeServerStream pipe=null;
                try {
                    pipe=new NamedPipeServerStream(Pipe,PipeDirection.InOut,2,PipeTransmissionMode.Byte,PipeOptions.Asynchronous,512,512,Permissions());
                    lock(pipes) pipes.Add(pipe);
                    pipe.WaitForConnection();
                    // Connections are one request long, with a small input and a deadline.
                    string request=Native.ReadLine(pipe,32,2000); int pid;
                    bool allowed=false;
                    if(Int32.TryParse(request,NumberStyles.None,CultureInfo.InvariantCulture,out pid) && pid>=0) {
                        allowed=Authorize(pipe,pid);
                    }
                    var result=allowed ? engine.Query(pid,ClientSid(pipe)) : new Dictionary<string,object>{{"fps",null},{"app",""},{"error","target"}};
                    byte[] output=Encoding.UTF8.GetBytes(new JavaScriptSerializer().Serialize(result)+"\n");
                    var write=pipe.WriteAsync(output,0,output.Length); write.Wait(2000);
                } catch { if(stopping) return; Thread.Sleep(500); }
                finally { if(pipe!=null) { lock(pipes) pipes.Remove(pipe); pipe.Dispose(); } }
            }
        }
        protected override void OnStop() {
            stopping=true; if(idle!=null) idle.Dispose();
            lock(pipes) foreach(var pipe in pipes) pipe.Dispose();
            engine.Dispose();
        }
        protected override void OnShutdown() { OnStop(); }
    }

    internal static class Program {
        static int Client(int parent) {
            var json=new JavaScriptSerializer();
            while(true) {
                try { using(var owner=Process.GetProcessById(parent)) if(owner.HasExited) return 0; } catch { return 0; }
                try {
                    using(var service=new ServiceController(CollectorService.Name)) {
                        if(service.Status==ServiceControllerStatus.Stopped) { service.Start(); service.WaitForStatus(ServiceControllerStatus.Running,TimeSpan.FromSeconds(8)); }
                    }
                    uint windowPid; Native.GetWindowThreadProcessId(Native.GetForegroundWindow(),out windowPid);
                    int target=windowPid==parent ? 0 : checked((int)windowPid);
                    using(var pipe=new NamedPipeClientStream(".",CollectorService.Pipe,PipeDirection.InOut,PipeOptions.Asynchronous,TokenImpersonationLevel.Impersonation)) {
                        pipe.Connect(2000);
                        byte[] input=Encoding.ASCII.GetBytes(target.ToString(CultureInfo.InvariantCulture)+"\n");
                        pipe.Write(input,0,input.Length);
                        Console.WriteLine(Native.ReadLine(pipe,1024,3000)); Console.Out.Flush();
                    }
                } catch { Console.WriteLine(json.Serialize(new { fps=(double?)null,app="",error="service" })); Console.Out.Flush(); }
                Thread.Sleep(1000);
            }
        }
        static int SelfTest() {
            var frames=new Frames();
            frames.Add("Application,SwapChainAddress,msBetweenPresents",0);
            frames.Add("game.exe,0x1,10",100); frames.Add("game.exe,0x1,10",101);
            frames.Add("game.exe,0x2,20",100); frames.Add("game.exe,0x2,20",101);
            if(frames.Read(102)!=100 || frames.Read(4000)!=null) return 1;
            frames.Add("game.exe,0x1,NaN",4000); if(frames.Read(4001)!=null) return 2;
            if(Frames.Csv("\"a,b\",\"c\"\"d\"")[1]!="c\"d") return 3;
            using(var identity=WindowsIdentity.GetCurrent()) if(!Native.Owns(Process.GetCurrentProcess().Id,identity.User)) return 4;
            if(Native.Owns(Process.GetCurrentProcess().Id,new SecurityIdentifier(WellKnownSidType.WorldSid,null))) return 5;
            string pipeName="Onbun.Fps.Test."+Guid.NewGuid().ToString("N");
            using(var server=new NamedPipeServerStream(pipeName,PipeDirection.InOut,1,PipeTransmissionMode.Byte,PipeOptions.Asynchronous,512,512,CollectorService.Permissions())) {
                var answer=Task.Run(()=> {
                    server.WaitForConnection(); int request=server.ReadByte();
                    bool allowed=CollectorService.Authorize(server,request==48 ? 0 : -1);
                    server.WriteByte(allowed ? (byte)49 : (byte)48);
                });
                using(var client=new NamedPipeClientStream(".",pipeName,PipeDirection.InOut,PipeOptions.Asynchronous,TokenImpersonationLevel.Impersonation)) {
                    client.Connect(2000); client.WriteByte(48);
                    var read=Task.Run(()=>client.ReadByte());
                    if(!read.Wait(3000) || read.Result!=49) return 6;
                }
                if(!answer.Wait(3000)) return 7;
            }
            Console.WriteLine("Collector self-test passed: frame averaging, swap chains, stale data, CSV, process ownership, local pipe ACL and impersonation."); return 0;
        }
        static int Main(string[] args) {
            if(args.Length==1 && args[0]=="--service") { ServiceBase.Run(new CollectorService()); return 0; }
            int parent;
            if(args.Length==2 && args[0]=="--client" && Int32.TryParse(args[1],out parent) && parent>0) return Client(parent);
            if(args.Length==1 && args[0]=="--self-test") return SelfTest();
            return 2; // No executable path, shell command or plugin argument is supported.
        }
    }
}
