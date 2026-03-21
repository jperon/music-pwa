# Partitura — PWA Lecteur de Partitions

Lecteur de partitions musicales installable (Progressive Web App), propulsé par **Verovio WASM**.

## Formats supportés

| Format | Extensions | Notes |
|--------|-----------|-------|
| **MusicXML** | `.xml`, `.musicxml`, `.mxl` | Compressé (MXL) supporté |
| **MEI** | `.mei` | Music Encoding Initiative |
| **LilyPond** | `.ly`, `.ily` | Support basique via Verovio |

## Fonctionnalités

- 🎼 Rendu haute qualité via **Verovio** (SVG natif)
- 📜 Scroll continu multi-pages
- 🔍 Zoom de 20% à 200%
- 📲 Installable comme app native (PWA)
- 📂 Glisser-déposer ou navigation fichiers
- 🌐 Support hors-ligne partiel (Service Worker)
- 🗂 File Handler API (ouverture directe depuis l'OS)

## Déploiement

Servez le dossier via un serveur HTTPS. Exemple rapide :

```bash
# Python
python3 -m http.server 8080

# Node
npx serve .

# Caddy / Nginx / Apache — requis pour la PWA en production
```

> **HTTPS obligatoire** pour l'installation PWA et le Service Worker.

## Structure

```
music-pwa/
├── index.html      — Interface principale
├── style.css       — Styles (thème sombre, Cormorant Garamond)
├── app.js          — Logique applicative + intégration Verovio
├── sw.js           — Service Worker (cache, offline)
├── manifest.json   — Manifest PWA
├── icon.svg        — Icône vectorielle
├── icon-192.png    — Icône PNG (manifest)
└── icon-512.png    — Icône PNG (splash)
```

## Dépendances

- [Verovio WASM](https://www.verovio.org/javascript.xhtml) — chargé depuis CDN
- [Cormorant Garamond](https://fonts.google.com/specimen/Cormorant+Garamond) — Google Fonts
- Aucune autre dépendance

## Notes LilyPond

Verovio supporte un sous-ensemble de LilyPond. Pour des fichiers complexes, envisagez une conversion préalable en MusicXML via [music21](https://web.mit.edu/music21/) ou [MuseScore](https://musescore.org/).
