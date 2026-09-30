---
name: SUNWAVE
description: Où est la lumière à Lisbonne, maintenant et plus tard dans la journée
colors:
  ink: "#0B1A45"
  night-deep: "#16224F"
  cream: "#FFF1D6"
  gold: "#FFD28A"
  orange: "#FF6A2B"
  ember: "#A83400"
  day: "#F3F6FC"
  day-dim: "#E6ECF8"
  line: "#C5D1EC"
  ink-soft: "#34487A"
  cool: "#D8E0F5"
  sun-mid: "#FFC9A6"
  sun-strong: "#FF9C66"
typography:
  display:
    fontFamily: "Funnel Display, system-ui, -apple-system, sans-serif"
    fontSize: "30px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Funnel Display, system-ui, -apple-system, sans-serif"
    fontSize: "18px"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Schibsted Grotesk, system-ui, -apple-system, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.3
  label:
    fontFamily: "Schibsted Grotesk, system-ui, -apple-system, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1
rounded:
  pill: "999px"
  lg: "22px"
  md: "18px"
  sm: "14px"
  circle: "50%"
spacing:
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "22px"
components:
  button-primary:
    backgroundColor: "{colors.orange}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "46px"
  chip-status:
    backgroundColor: "{colors.cream}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    height: "32px"
  chip-status-gold:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    height: "32px"
---

# Design System: SUNWAVE

## Overview

**Creative North Star: "La carte du jour d'une esplanada."**

SUNWAVE dit, dehors et sur mobile, où est la lumière maintenant. La preuve la plus complète de ce système à ce jour est l'écran Explorer (« la carte du jour ») et l'écran Favoris (« les horaires du jour ») : chaque envie ou chaque lieu gardé se lit comme une ligne de menu — un nom, une note de contexte, et à la place du prix, jusqu'à quand il y a de la lumière. C'est une carte crème cernée d'encre, en contre-jour : un trait d'ombre dur, jamais flou, dont l'angle et le décalage suivent la position réelle du soleil au moment où l'écran s'affiche. Rien n'y est plat par défaut — refusé explicitement par l'utilisateur — et rien n'y est réduit à une grille de boutons égaux : chaque ligne porte sa propre photo, son propre décompte, sa propre heure.

L'orange et le doré sont réservés à ce qui est **au soleil maintenant** ; le bleu froid et l'encre à ce qui est **à l'ombre** ou **plus tard**. Aucune information d'état ne passe jamais par le vert ou le rouge — un engagement de PRODUCT.md tenu dans les deux écrans construits. Les icônes de catégorie sont des photos rondes en contre-jour, jamais des pictogrammes ; les seuls glyphes dessinés à la main sont la flèche de retour et le système « halo » (soleil/ombre/toi), toujours en SVG tracé, jamais en emoji ou police d'icônes.

**Key Characteristics:**
- Carte crème (#FFF1D6) cernée d'un trait d'encre (#0B1A45), jamais de fond blanc nu.
- Ombre dure, zéro flou, pilotée par l'azimut et l'élévation réelle du soleil (`--sx` / `--sy` / `--ang` / `--cut`), pas une constante de design.
- Funnel Display (800) pour tout ce qui affirme — titres, prix-temps, chiffres ; Schibsted Grotesk (600–700) pour tout ce qui informe — labels, sous-titres, badges.
- Aucune tuile-bouton : tout est ligne de menu, ticket, ou carte de lieu, jamais une grille de cartes identiques.
- Orange/doré = lumière maintenant ; bleu froid/encre = ombre ou plus tard ; jamais vert, jamais rouge.

## Colors

Une seule paire chaude (orange/doré) porte tout le sens « lumière » ; le reste de la palette est de l'encre, du crème et du bleu froid — support, jamais message.

### Primary
- **Contre-jour Orange** (#FF6A2B): l'état « au soleil maintenant » — segment actif du sélecteur Soleil, puce des lignes actives, boutons d'action primaires (« M'y emmener »), pointillé de la ligne « maintenant » sur la règle des Favoris.
- **Menu Gold** (#FFD28A): l'accent du « plat du jour » — l'étiquette de la meilleure envie, la puce de l'heure du coucher, jamais utilisé pour un état ordinaire.

### Secondary
- **Ember** (#A83400): le texte du label « jusqu'à » quand on est au soleil — la variante encre-chaude de l'orange pour le texte fin sur fond crème.
- **Cool Blue** (#D8E0F5): l'état « à l'ombre » ou « plus tard » — segment actif du sélecteur Ombre, fond des lignes non urgentes.

### Neutral
- **Deep Ink** (#0B1A45): le texte, les bordures (1.5px) et l'ombre dure de toute la carte — la couleur qui « cerne » chaque surface.
- **Night Deep** (#16224F): fond de secours des vignettes et de l'en-tête photo quand l'image n'a pas encore chargé.
- **Menu Cream** (#FFF1D6): la surface de carte — jamais de blanc pur.
- **Sky Day** (#F3F6FC): le fond de page derrière la carte.
- **Day Dim** (#E6ECF8): le fond des lieux « pas de soleil aujourd'hui » — la même famille que Sky Day, juste posée.
- **Line** (#C5D1EC): la bordure des lieux hors-jeu, seule bordure du système qui n'est pas de l'encre.
- **Ink Soft** (#34487A): tout le texte secondaire — quartier, horaires, sous-titres.

### Named Rules
**The Sundial Rule.** Chaque ombre dure du système (`box-shadow: var(--sx) var(--sy) 0 var(--ink)`) tient son décalage de l'azimut et de l'élévation réelles du soleil au moment du rendu, pas d'une constante de style. Une ombre statique dans ce monde est un bug, pas un choix esthétique.

**The One Warm Voice Rule.** Orange et doré ne disent qu'une chose : il y a de la lumière recherchée, maintenant. Ils ne servent jamais à autre chose (pas de bouton "danger" orange, pas de badge doré générique). Le bleu froid et l'encre couvrent tout le reste, y compris "plus tard" et "hors-jeu" — jamais de vert, jamais de rouge pour dire un état.

## Typography

**Display Font:** Funnel Display (with system-ui, -apple-system, sans-serif fallback)
**Body Font:** Schibsted Grotesk (with system-ui, -apple-system, sans-serif fallback)

**Character:** Funnel Display porte tout ce qui doit claquer — titres, prix-temps, rangs numérotés ; toujours en 800, jamais en poids intermédiaire. Schibsted Grotesk porte tout ce qui informe en retrait — labels, badges, sous-titres — en 600 ou 700, jamais en régulier.

### Hierarchy
- **Display** (800, 25–30px, line-height 1, tracking -0.02em): titre d'écran (« Aujourd'hui dehors », « La carte du jour », « Mes lieux, aujourd'hui »).
- **Title** (800, 17–21px, line-height 1.05–1.1, tracking -0.01em): nom de lieu, ligne du « plat du jour », titre de ticket.
- **Price** (800, 16–22px, tabular-nums): la valeur « jusqu'à / dès » qui occupe la position du prix sur chaque ligne.
- **Body/Label** (600–700, 11–13px): sous-titres, quartier, badges de statut, graduations de la règle horaire — toujours en majuscule ou capitalisation naturelle selon le badge, jamais en poids régulier.

### Named Rules
**The Menu Rule.** La position où un menu de restaurant mettrait un prix affiche toujours, dans ce système, l'heure jusqu'à laquelle il y a de la lumière (`untilOf`). Aucune ligne ne se termine par un chevron ou une icône neutre : elle se termine par une heure.

## Layout

Mobile, une colonne, défilement vertical plein écran. Chaque écran ouvre sur une photo d'en-tête (250px de haut, degradé encre en bas) surmontée d'une barre de statut ; la carte crème remonte par-dessus la photo (`margin-top: -22px`), un effet de fiche qui chevauche son illustration. Les lignes de menu (Explorer) sont séparées par un tiret pointillé horizontal (1.5px dashed) plutôt qu'un espace vide ou une bordure pleine. Les tickets de résultats (DiscoverResults) et les cartes de lieux (Favoris) sont des blocs crème indépendants espacés de 10–12px, pas une liste sans relief. La règle horaire des Favoris (8h–21h) est collante en haut d'écran (`position: sticky`) pendant le défilement de la liste.

## Elevation & Depth

Pas d'ombre douce ni de flou dans ce système : toute la profondeur vient d'une ombre dure à décalage court (2–5px), zéro flou, couleur encre — et cette ombre est pilotée par la position réelle du soleil (voir The Sundial Rule), pas par un token de profondeur générique. C'est un choix du monde Contre-jour, pas un neobrutalisme décoratif : l'ombre du système représente littéralement l'ombre projetée à l'heure du jour affichée.

### Shadow Vocabulary
- **Card / badge shadow** (`box-shadow: var(--sx) var(--sy) 0 var(--ink)`): la carte principale, les tickets, les badges de statut — l'ombre pleine.
- **Later shadow** (`box-shadow: calc(var(--sx)*.6) calc(var(--sy)*.6) 0 var(--ink)`): les lieux « plus tard » dans Favoris — une ombre atténuée à 60%, plus discrète que les lieux « bons maintenant ».
- **Off (no shadow)**: les lieux « pas de soleil aujourd'hui » n'ont aucune ombre — la platitude marque explicitement l'état hors-jeu.
- **Pressed** (`box-shadow: none`, `transform: translate(3px, 3px)`): l'état actif des boutons d'action — l'ombre disparaît quand le bouton "s'enfonce" jusqu'au trait d'encre.

### Named Rules
**The Weight-of-Light Rule.** L'intensité de l'ombre dure code l'urgence de la lumière : pleine pour « bon maintenant », 60% pour « plus tard », nulle pour « hors-jeu ». La profondeur visuelle suit directement la pertinence temporelle, jamais une hiérarchie décorative.

## Shapes

Traits d'encre (1.5px solid) partout où une surface a besoin d'un bord ; jamais de bordure de plus de 1.5px ni de couleur autre que l'encre, sauf la seule exception neutre `--line` pour les lieux hors-jeu. Coins très arrondis sur les cartes (22px/18px/14px selon le rôle) mais coins en pilule pleine (999px) pour tout badge, puce ou segment de contrôle. Les vignettes de catégorie sont des cercles pleins (50%) recouverts d'une photo, jamais des carrés ni des icônes. Les étiquettes courtes (« Plat du jour », badges de statut) sont posées en léger pivot (-2° à -3°), comme des autocollants — c'est le seul endroit où une forme quitte l'axe droit du système.

## Components

### Buttons
- **Shape:** coins à 14px (`border-radius: 14px`), hauteur minimale 46px.
- **Primary:** fond orange (#FF6A2B), texte encre, bordure encre 1.5px, ombre dure pleine (Card / badge shadow) — action principale (« M'y emmener »).
- **Primary (mode ombre):** même forme, fond bleu froid (#D8E0F5) au lieu d'orange — la variante suit la règle One Warm Voice.
- **Ghost:** fond transparent, aucune bordure ni ombre — action secondaire à côté d'un bouton primaire (« Garder »).
- **Press:** l'ombre disparaît et le bouton se translate de son propre décalage d'ombre (3px, 3px) — l'enfoncement physique du trait d'encre.

### Chips / Badges (signature du système)
- **Style:** pilule crème ou dorée, bordure encre 1.5px, ombre dure, texte Schibsted Grotesk 700 en petite capitale — utilisé pour le statut horaire, la position (« La carte » retour), le compte « au soleil ».
- **State:** léger pivot (-2° / 2° / -3°) selon le badge ; le badge doré marque toujours l'élément mis en avant (plat du jour, badge de compte actif).

### Cards / Containers
- **Corner Style:** 22px (carte principale), 18px (ticket, carte de lieu), 14px (bandeau du dessert en bas de carte).
- **Background:** crème (#FFF1D6) par défaut ; crème pâle (#FBF4E6) pour « plus tard » ; bleu-gris (#E6ECF8) pour « hors-jeu ».
- **Shadow Strategy:** voir Elevation & Depth — pleine / 60% / nulle selon l'urgence.
- **Border:** encre 1.5px, sauf état « hors-jeu » qui prend la bordure neutre `--line`.
- **Internal Padding:** 12–18px, resserré à 8–10px entre les éléments d'une même ligne.

### Signature Component: HourBand
La bande horaire (8h–21h) est le composant qui porte le plus de sens du système : une case par heure, orange à mesure que le soleil devient franc (`s1` clair → `s3` plein orange), bleu pâle à l'ombre, encre pleine après le coucher du soleil calculé pour ce lieu précis. Un trait vertical marque « maintenant ». Elle apparaît sous chaque lieu dans les trois écrans (plat du jour, ticket de résultat, carte de Favoris) et remplace toute description textuelle de l'exposition — c'est le seul endroit du système où l'information est purement graphique.

### Navigation
Pas de barre de navigation dessinée dans ces deux écrans : le retour se fait par un badge-bouton en haut à gauche de l'en-tête photo (chevron SVG tracé + libellé), dans le même vocabulaire pilule que les autres badges de statut.

## Do's and Don'ts

### Do:
- **Do** piloter le décalage et l'angle de toute ombre dure depuis la position réelle du soleil (`--sx`, `--sy`, `--ang`, `--cut`), jamais une valeur fixe.
- **Do** réserver l'orange et le doré à « il y a de la lumière recherchée maintenant » ; tout le reste (plus tard, hors-jeu, ombre) reste en bleu froid ou en encre.
- **Do** terminer chaque ligne de liste par une heure (« jusqu'à », « dès »), jamais par une icône neutre ou un chevron.
- **Do** représenter chaque catégorie par une photo ronde en contre-jour (46px), jamais par un pictogramme ou une police d'icônes.
- **Do** dessiner les icônes fonctionnelles (retour, halo soleil/ombre) en SVG tracé à trait constant — jamais en emoji ni glyphe unicode.

### Don't:
- **Don't** utiliser le vert ou le rouge pour dire un état — c'est un engagement produit, pas une préférence stylistique.
- **Don't** aligner les envies ou les lieux en grille de tuiles-boutons égales — chaque ligne porte sa propre photo et sa propre heure ; la grille a été explicitement refusée.
- **Don't** ajouter un flou à l'ombre dure du système : c'est un contre-jour à trait net, pas un neobrutalisme décoratif générique — l'ombre suit le soleil, elle ne l'illustre pas.
- **Don't** poser un bandeau/kicker au-dessus d'un titre pour l'annoncer : dans ce système, un badge ou une étiquette reste un élément autonome (statut, compte, retour), jamais un sur-titre au-dessus d'un texte fort qui joue le rôle d'un titre — voir la note de l'auditeur sur `cdj-tag`.
