# Sora Vertical Studio

Mini studio local en Next.js pour lancer et suivre des generations Sora 2 en vertical.

## Ce que fait le projet

- prompt texte seul
- prompt texte + image de reference
- choix de duree: 4, 8 ou 12 secondes
- choix du format vertical: 720x1280 ou 1024x1792
- lancement de plusieurs generations en une fois
- suivi local des statuts et telechargement automatique du MP4 une fois termine
- commande terminal pour lancer un batch sans passer par l'interface

## Demarrage

1. Installer les dependances

```bash
npm install
```

2. Ajouter votre cle API

```bash
cp .env.example .env.local
```

Puis renseigner `OPENAI_API_KEY`.

3. Lancer l'interface locale

```bash
npm run dev
```

Puis ouvrir l'adresse affichee par Next.js. En general ce sera [http://localhost:3000](http://localhost:3000), mais si ce port est deja pris il en choisira un autre automatiquement.

## Commande terminal

```bash
npm run sora -- --prompt "Une creatrice UGC en salle de bain lumineuse" --seconds 8 --size 720x1280 --count 2
```

Avec image de reference:

```bash
npm run sora -- --prompt "Packshot skincare premium, camera lente, lumiere chaude" --image "/chemin/vers/image.jpg"
```

## Stockage local

- les generations sont memorisees dans `data/sora-generations.json`
- les images d'entree recadrees sont sauvegardees dans `public/uploads`
- les videos generees sont sauvegardees dans `public/generated`

## Notes utiles

- l'interface rafraichit automatiquement les statuts toutes les 10 secondes
- les images d'entree sont recadrees automatiquement en 9:16
- si OpenAI rejette une image avec visage, le message d'erreur apparait dans la carte de generation
