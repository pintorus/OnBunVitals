# Vitals pour Onbun

Tableau de bord natif en français : CPU, mémoire, disque système, GPU, températures CPU/GPU, FPS et charge système. Aucun paquet npm à installer, aucun service distant.

## Installer

Copiez le dossier **vitals** entier dans le dossier des apps Onbun : **îlot → Settings → Apps → Open folder**. L’app apparaît immédiatement ; chaque sauvegarde recharge l’app et son écran. Le téléphone signale précisément les éventuelles erreurs du Kit.

## Éditeur intégré

Sur le téléphone, touchez l’icône de réglages d’un widget, ou maintenez le widget. Le bouton de réglages dans la barre donne accès à tous les widgets, y compris ceux qui sont masqués.

- Trois tailles : petite (valeur), moyenne (jauge), grande (jauge et historique).
- Dix couleurs normales ; les seuils remplacent la couleur par orange ou rouge, avec un libellé explicite.
- Visibilité, ordre, seuil de vigilance et seuil critique par widget.
- **Enregistrer** applique la fiche ; **Annuler** abandonne ses changements. Monter/Descendre enregistre immédiatement l’ordre.
- Les grandes cartes occupent une rangée. Deux cartes consécutives de même taille peuvent partager une rangée en paysage ; les petites le font aussi en portrait.
- Cadence CPU/mémoire : 1, 2 ou 5 secondes. Disque et capteurs matériels : 5 secondes. Le téléphone demande les données toutes les 1,5 seconde.
- Historique glissant de 60 secondes pendant la session. Notifications critiques Onbun facultatives, désactivées initialement ; une par minute et par widget au maximum.

Les préférences sont enregistrées atomiquement dans `ctx.dataDir/settings.json`. L’historique reste en mémoire et disparaît au rechargement. Aucun réglage n’efface vos données personnelles.

## Sources réelles et limites matérielles

| Mesure | Source |
| --- | --- |
| CPU | Deltas des compteurs CPU du système, total de tous les cœurs logiques. |
| Mémoire | Mémoire utilisée / totale. Linux utilise MemAvailable ; macOS inclut le cache dans l’estimation utilisée. |
| Disque | Volume système : espace total et espace disponible pour l’utilisateur. Ce n’est pas le débit ni le taux d’activité du disque. |
| Charge | Moyenne sur une minute, divisée par le nombre de cœurs logiques ; peut dépasser 100 %. macOS/Linux uniquement. |
| GPU NVIDIA | Premier GPU de `nvidia-smi` accessible dans le PATH : utilisation et température. |
| GPU Linux | Premier GPU exposant `gpu_busy_percent` (notamment AMD). Température AMD via hwmon. |
| Température CPU Linux | Maximum des capteurs CPU hwmon reconnus : coretemp, k10temp, zenpower, cpu_thermal, soc_thermal. |
| Windows, capteurs supplémentaires | Fournisseur WMI `root/LibreHardwareMonitor` de Libre Hardware Monitor en cours d’exécution : température CPU, charge et température GPU. |
| Autres GPU, températures macOS, FPS | Télémétrie locale décrite ci-dessous. |

Les requêtes externes sont bornées à 3,5 secondes. Une source NVIDIA ou WMI indisponible est réessayée après 60 secondes. Les compteurs système continuent pendant ce temps. Vitals ne demande pas les droits administrateur et n’installe pas de pilote.

Une donnée absente affiche **Indisponible**, jamais une valeur simulée. Les FPS sont des images réellement produites par un jeu, pas la fréquence de rafraîchissement du moniteur. Il n’existe pas de compteur FPS système universel ; Vitals n’installe pas PresentMon, RTSS, MangoHud ou un outil de capture.

## Connecter les FPS ou un autre moniteur

Sur l’ordinateur : **îlot → Settings → Vitals** affiche le chemin exact du fichier `telemetry.json` dans le répertoire privé de l’app. Configurez votre outil ou un adaptateur pour y écrire, toutes les 1 à 5 secondes :

```json
{
  "timestamp": 1794654000000,
  "fps": 144,
  "gpu": 62,
  "cpuTemp": 68,
  "gpuTemp": 71
}
```

`timestamp` est l’heure Unix **actuelle en millisecondes**, pas la valeur de cet exemple. Tous les autres champs sont facultatifs : FPS entre 0 et 2000, GPU entre 0 et 100 %, températures entre 0 et 150 °C. Le compteur FPS accepte bien zéro. Utilisez des nombres JSON, pas des chaînes avec unités.

Écrivez d’abord un fichier temporaire, puis renommez-le en `telemetry.json` dans le même répertoire. Le fichier doit rester inférieur à 64 Kio. Les valeurs sont rejetées après 10 secondes sans mise à jour, ou si l’horloge est en avance de plus de 2 secondes. Les champs valides fournis remplacent les sources automatiques correspondantes ; les champs absents utilisent les sources automatiques. Un fichier invalide est ignoré avec une erreur lisible.

Exemple d’écriture côté adaptateur Python, à intégrer là où votre outil dispose de **vraies** mesures :

```python
import json, os, time
from pathlib import Path

def publish(destination, *, fps=None, gpu=None, cpu_temp=None, gpu_temp=None):
    target = Path(destination)  # chemin affiché par Vitals sur le PC
    values = dict(fps=fps, gpu=gpu, cpuTemp=cpu_temp, gpuTemp=gpu_temp)
    payload = {"timestamp": int(time.time() * 1000)}
    payload.update({key: value for key, value in values.items() if value is not None})
    temporary = target.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload, allow_nan=False), encoding="utf-8")
    os.replace(temporary, target)
```

Les champs arbitraires de ce fichier ne sont jamais relayés au téléphone. L’app ne partage que son écran, ses icônes et ses assets, pas son dossier de données.

## Vérifier

Depuis le dossier parent :

```sh
node vitals/test/vitals.test.cjs
```

Les tests couvrent les compteurs CPU, les seuils inversés FPS, les entrées invalides, la restauration, le regroupement des cartes, la télémétrie expirée/volumineuse, la sauvegarde, l’échec d’écriture, les commandes et l’arrêt des collectes. Un relevé réel est effectué sur l’ordinateur de test.

Le fichier `ui/screen.json` est validé contre le [schéma officiel Onbun](https://mathieudvv.github.io/WinMore-releases/data/screen.schema.json). Si vous disposez du code source Onbun, exécutez aussi :

```sh
npm run check:apps -- /chemin/vers/vitals
```

L’app utilise uniquement les composants Kit documentés ; le même écran sert iPhone et Android, en portrait et paysage. La validation du schéma ne remplace pas un contrôle visuel sur téléphone.
