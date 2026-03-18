# Sora Vertical Studio

Mini studio local en Next.js pour lancer et suivre des generations Sora 2 en vertical.

## Ce que fait le projet

- photo de la creatrice obligatoire
- champ pour le texte exact qu'elle dit
- champ pour la scene et les settings
- choix de duree: 4, 8 ou 12 secondes
- choix du modele: Sora 2 ou Sora 2 Pro
- format vertical TikTok impose automatiquement
- suivi local des statuts et telechargement automatique du MP4 une fois termine
- commande terminal pour lancer le meme flux sans passer par l'interface

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
npm run sora -- --spoken "Stop, si ta peau tiraille apres la douche..." --scene "Face camera, salle de bain lumineuse, ton naturel, rythme hook" --image "/chemin/vers/image.jpg" --seconds 8
```

## Stockage local

- les generations sont memorisees dans `data/sora-generations.json`
- les images d'entree recadrees sont sauvegardees dans `public/uploads`
- les videos generees sont sauvegardees dans `public/generated`

## Notes utiles

- l'interface rafraichit automatiquement les statuts toutes les 10 secondes
- les images d'entree sont recadrees automatiquement en 9:16
- si OpenAI rejette une image avec visage, le message d'erreur apparait dans la carte de generation
