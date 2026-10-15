# FantasyUefa visual asset sources

These local assets are used for the FantasyUefa fan-made interface. They are not presented as sponsorship or endorsement.

## Competition logos

- `competitions/premier-league.svg` — Premier League logo site: https://logo.premierleague.com/
- `competitions/laliga.png` — LaLiga official pressroom downloads: https://www.laliga.com/en-GB/pressroom/logos-and-corporate-dossier/logos
- `competitions/champions-league.png` — UEFA official media download package: https://www.uefa.com/news-media/mediaservices/mediadownloads/

## Public legend photos

- `legends/thierry-henry.jpg` — Thierry Henry photo by Web Summit, Wikimedia Commons, CC BY 2.0: https://commons.wikimedia.org/wiki/File:Thierry_Henry_(51649035951)_(cropped).jpg
- `legends/mohamed-salah.jpg` — Mohamed Salah photo by soccer.ru, Wikimedia Commons, CC BY-SA 3.0: https://commons.wikimedia.org/wiki/File:Mohamed_Salah_2017.jpg
- `legends/cristiano-ronaldo.jpg` — Cristiano Ronaldo photo by Ilya Khokhlov, Wikimedia Commons, CC BY-SA 3.0: https://commons.wikimedia.org/wiki/File:Cristiano_Ronaldo_20120609.jpg

Brand ownership and image licenses remain with the respective rights holders. Attribution is retained here for the public photos. The site footer identifies FantasyUefa as an unofficial fan-made concept.

The deploy-facing SVG copies are also available at `public/img/competitions/` under the same three filenames; LaLiga and Champions League preserve the official downloaded artwork inside SVG containers for the required SVG paths.

Player profile faces are loaded at runtime from the English Wikipedia REST summary API, using the corresponding encyclopedia thumbnail when available; initials and kit-colour illustrations remain the fallback. Transfer corrections in this release: Trent Alexander-Arnold → Real Madrid, Alexander Isak → Liverpool, and Eberechi Eze → Arsenal.

The 2026/27 player pool is based on the official Premier League submitted squad lists and Transfer Watch pages: https://www.premierleague.com/en/news/4706139/see-all-the-202627-premier-league-squad-lists and https://www.premierleague.com/en/transfers/2026-27/summer. It includes current-season additions and removes players no longer registered in the Premier League, including Trent Alexander-Arnold and Marc Cucurella.
