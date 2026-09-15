# -*- coding: utf-8 -*-
"""Build de la PDV Florence v2 (brouillon).
Source : ~/Desktop/pdv-help-deploy/florence/index.html (= le live, byte-identique)
Sortie : ~/Desktop/pdv-v2/out/fr/florence-v2/index.html  -> artinthe.city/fr/florence-v2
Aucune modification du live. Relançable à chaque passe de relecture copy."""
import json, os, re, sys, pathlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import content_fr as C

SRC = os.path.expanduser("~/Desktop/pdv-help-deploy/florence/index.html")
OUT = os.path.expanduser("~/Desktop/pdv-v2/out/florence-v2/index.html")
s = open(SRC, encoding="utf-8").read()
N = [0]

def rep(old, new, n=1, label=""):
    c = s.count(old)
    assert c == n, f"[{label or old[:60]}] attendu {n} occurrence(s), trouvé {c}"
    N[0] += 1
    return s.replace(old, new)

def js(x):  # littéral JS sûr
    return json.dumps(x, ensure_ascii=False)

# ════════════════════════════════════════════════════════════
# 1. MOTEUR DU TOUR : nouvel ordre des étapes
# ════════════════════════════════════════════════════════════
s = rep('var CAT_ORDER=["infos","prix","apropos","temoignages","expose"];',
        'var CAT_ORDER=["idee","prix","temoignages","infos","expose"];var HOME_ID=CAT_ORDER[0];',
        label="CAT_ORDER")

s = rep('var CAT_SLUG={infos:"info",prix:"benefits",apropos:"vision",temoignages:"testimonials",expose:"exhibit"};',
        'var CAT_SLUG={idee:"idea",infos:"info",prix:"benefits",apropos:"vision",temoignages:"testimonials",expose:"exhibit"};',
        label="CAT_SLUG")

# nouvelle étape 1 dans CATS (le FR reste la source du fichier)
s = rep('  var CATS = {\n',
        '  var CATS = {\n'
        '    idee:{ label:"L\'idée", navLabel:"L\'idée", icon:"ti-bulb", eyebrow:"Remplacer la pub par de l\'art", noFaq:true, title:"",\n'
        '      intro: ' + js(C.IDEE) + ' },\n',
        label="CATS.idee")

# cartes thèmes : nouvel ordre + nouveaux intitulés
s = rep("""    {id:"infos",ic:"ti-map-pin",t:"Infos & Programme",s:"Lieu, dates, comment ça marche"},
    {id:"prix",ic:"ti-tag",t:"Prix & Avantages",s:"Tarifs et ce qui est inclus"},
    {id:"apropos",ic:"ti-flag",t:"Notre vision",s:"Notre mission, qui nous sommes"},
    {id:"temoignages",ic:"ti-quote",t:"Témoignages",s:"Ils ont exposé avec nous"},
    {id:"expose",ic:"ti-photo",t:"Œuvres & formats",s:"Formats, tailles, prix"},
    {id:"faq",ic:"ti-help",t:"FAQ",s:"Recherche, thèmes, chat en direct"}""",
"""    {id:"idee",ic:"ti-bulb",t:"L'idée",s:"Remplacer la pub par de l'art"},
    {id:"prix",ic:"ti-gift",t:"Ce que tu reçois",s:"Tout ce qui est inclus"},
    {id:"temoignages",ic:"ti-quote",t:"Ils l'ont fait",s:"6 000 artistes depuis 2018"},
    {id:"infos",ic:"ti-map-pin",t:"Comment ça se passe",s:"Lieu, dates, programme"},
    {id:"expose",ic:"ti-photo",t:"Choisis ta place",s:"Formats, tailles, places"},
    {id:"apropos",ic:"ti-flag",t:"Notre histoire",s:"Notre mission, qui nous sommes"},
    {id:"faq",ic:"ti-help",t:"FAQ",s:"Recherche, thèmes, chat en direct"}""",
        label="TILES")

# tuiles statiques de l'accueil (même ordre)
s = rep("""      <button class="tile" data-open="infos"><i class="ti ti-map-pin"></i><span class="tl">Infos &amp; Programme</span><span class="th">Lieu, dates, comment ça marche</span></button>
      <button class="tile" data-open="formats"><i class="ti ti-photo"></i><span class="tl">Œuvres &amp; formats</span><span class="th">Formats, tailles, ton œuvre</span></button>
      <button class="tile" data-open="prix"><i class="ti ti-tag"></i><span class="tl">Prix &amp; Avantages</span><span class="th">Tarifs et ce qui est inclus</span></button>
      <button class="tile" data-open="apropos"><i class="ti ti-flag"></i><span class="tl">Notre histoire</span><span class="th">Notre mission, qui nous sommes</span></button>
      <button class="tile" data-open="temoignages"><i class="ti ti-quote"></i><span class="tl">Témoignages</span><span class="th">Ils ont exposé avec nous</span></button>""",
"""      <button class="tile" data-open="idee"><i class="ti ti-bulb"></i><span class="tl">L'idée</span><span class="th">Remplacer la pub par de l'art</span></button>
      <button class="tile" data-open="prix"><i class="ti ti-gift"></i><span class="tl">Ce que tu reçois</span><span class="th">Tout ce qui est inclus</span></button>
      <button class="tile" data-open="temoignages"><i class="ti ti-quote"></i><span class="tl">Ils l'ont fait</span><span class="th">6 000 artistes depuis 2018</span></button>
      <button class="tile" data-open="infos"><i class="ti ti-map-pin"></i><span class="tl">Comment ça se passe</span><span class="th">Lieu, dates, programme</span></button>
      <button class="tile" data-open="expose"><i class="ti ti-photo"></i><span class="tl">Choisis ta place</span><span class="th">Formats, tailles, places</span></button>""",
        label="tuiles-accueil")

# ── l'étape 1 n'est plus « infos » : tout ce qui y était codé en dur suit HOME_ID
s = rep('var hh=\'<a class="tour-accueil" data-open="infos" href="\'+catHash("infos")+\'">← \'+esc(t.accueil)+\'</a>\'+',
        'var hh=\'<a class="tour-accueil" data-open="\'+HOME_ID+\'" href="\'+catHash(HOME_ID)+\'">← \'+esc(t.accueil)+\'</a>\'+',
        label="hors-tour accueil")
s = rep('<a class="bravo-cta" data-open="infos" href="\'+catHash("infos")+\'">',
        '<a class="bravo-cta" data-open="\'+HOME_ID+\'" href="\'+catHash(HOME_ID)+\'">',
        label="faq bravo-cta")
s = rep("""      (id!=="infos"
        ? '<div class="tour-nav-top">'+
            '<a class="tour-accueil" data-open="infos" href="'+catHash("infos")+'">← '+esc(t.accueil)+'</a>'+""",
"""      (id!==HOME_ID
        ? '<div class="tour-nav-top">'+
            '<a class="tour-accueil" data-open="'+HOME_ID+'" href="'+catHash(HOME_ID)+'">← '+esc(t.accueil)+'</a>'+""",
        label="tour-nav-top")

# en-tête étape 1 : on garde le tag + le compte à rebours + le CTA ; le prix quitte le haut de page (§5.1)
s = rep("""      (id==="infos" && t.regTag?'<span class="reg-tag"><span class="reg-dot"></span>'+esc(t.regTag)+'</span>':'')+(id==="infos"?'<div class="rt-countdown" id="rtCountdown"></div>':'')+
      (id==="infos"?'<div class="tour-head-title">'+esc(t.tourTitle)+'</div>':'')+
      (id==="infos"?'<p class="tour-head-note">'+esc(t.priceFrom)+' <span class="startprice" data-size="S">49 €</span></p>':'')+(id==="infos"?tpl('<div class="rt-cta-wrap"><a class="rt-cta" href="{PRICE}" target="_blank" rel="noopener">'+esc(t.pdvCta)+'</a></div>'):'')+""",
"""      (id===HOME_ID && t.regTag?'<span class="reg-tag"><span class="reg-dot"></span>'+esc(t.regTag)+'</span>':'')+(id===HOME_ID?'<div class="rt-countdown" id="rtCountdown"></div>':'')+
      (id===HOME_ID?tpl('<div class="rt-cta-wrap"><a class="rt-cta" href="{PRICE}" target="_blank" rel="noopener">'+esc(t.pdvCta)+'</a></div>'):'')+""",
        label="tour-head étape 1")

s = rep('    if(id==="infos"){   // accueil fusionné : hero + jauge',
        '    if(id===HOME_ID){   // accueil fusionné : hero + jauge',
        label="hero sur étape 1")
s = rep('<a class="home-th-cta wb-start" data-open="infos" href="#info">',
        '<a class="home-th-cta wb-start" data-open="\'+HOME_ID+\'" href="\'+catHash(HOME_ID)+\'">',
        label="welcomebox CTA")
s = rep('else openCat("infos", false);', 'else openCat(HOME_ID, false);', label="ouverture par défaut")

# ── le bouton « Continuer » annonce l'étape suivante (§6)
s = rep("""      var nextBtn = nx
        ? '<a class="tour-next" data-open="'+nx+'" href="'+catHash(nx)+'">'+esc(t.continueCta)+' <i class="ti ti-arrow-right ar"></i></a>'""",
"""      var nextBtn = nx
        ? '<a class="tour-next" data-open="'+nx+'" href="'+catHash(nx)+'">'+esc(t.continueCta)+' : '+esc((CATS[nx]&&CATS[nx].eyebrow)||labelFor(nx))+' <i class="ti ti-arrow-right ar"></i></a>'""",
        label="tour-next annonce")
s = rep("""    var _sc = nx
      ? '<a class="sticky-next" data-open="'+nx+'" href="'+catHash(nx)+'">'+esc(t.continueCta)+' <i class="ti ti-arrow-right"></i></a>'""",
"""    var _sc = nx
      ? '<a class="sticky-next" data-open="'+nx+'" href="'+catHash(nx)+'">'+esc(t.continueCta)+' : '+esc((CATS[nx]&&CATS[nx].eyebrow)||labelFor(nx))+' <i class="ti ti-arrow-right"></i></a>'""",
        label="sticky-next annonce")

# ── hero : titre + sous-titre, 3 variantes testables (?hero=A|B|C)
s = rep("""      var h1=document.querySelector(".hero-text h1"); if(h1) h1.innerHTML=t.heroTitle;""",
"""      var _hk=((new URLSearchParams(location.search)).get("hero")||"A").toUpperCase();
      var _HV=(t.heroVars&&(t.heroVars[_hk]||t.heroVars.A))||null;
      var h1=document.querySelector(".hero-text h1"); if(h1) h1.innerHTML=(_HV?_HV.t:t.heroTitle);
      var _hin=document.querySelector(".hero-text-inner");
      if(_hin&&h1){ var _hs=_hin.querySelector(".hero-sub");
        if(!_hs){ _hs=document.createElement("p"); _hs.className="hero-sub"; h1.parentNode.insertBefore(_hs,h1.nextSibling); }
        _hs.innerHTML=(_HV?_HV.s:(t.heroSub||"")); }""",
        label="hero variantes")

# ════════════════════════════════════════════════════════════
# 2. CONTENU i18n (FR)
# ════════════════════════════════════════════════════════════
m = re.search(r'/\*I18N\*/(.*?)/\*END\*/', s, re.S)
assert m, "bloc i18n introuvable"
D = json.loads(m.group(1))
fr = D["fr"]

# — hero
fr["ui"]["heroVars"] = C.HERO_VARS
fr["ui"]["heroTitle"] = C.HERO_VARS["A"]["t"]
fr["ui"]["heroSub"]   = C.HERO_VARS["A"]["s"]

# — faits verrouillés (§7)
fr["EXPO"]["audience"] = "jusqu'à 100 000 visiteurs"
fr["EXPO"]["intro"] = ("Un tunnel immersif de 25 mètres au cœur de Florence, murs et plafond couverts d'écrans LED HD. "
                       "Ton art exposé pendant 2 jours, vu par jusqu'à 100 000 visiteurs.")
fr["ui"]["gaugeUnlock"] = fr["ui"]["gaugeUnlock"].replace("<b>100 000 visiteurs</b>", "<b>jusqu'à 100 000 visiteurs</b>")
fr["ui"]["tourTitle"] = fr["ui"]["tourTitle"].replace("visible par 100 000 personnes", "visible par jusqu'à 100 000 visiteurs")

# — étape 1
fr["catMeta"]["idee"] = {"label": "L'idée", "navLabel": "L'idée",
                         "eyebrow": "Remplacer la pub par de l'art", "title": "",
                         "eyebrowSub": "L'idée, le mécanisme, le prix."}
fr["catIntros"]["idee"] = C.IDEE

# — étape 2
fr["catMeta"]["prix"]["label"] = "Ce que tu reçois"
fr["catMeta"]["prix"]["navLabel"] = "Ce que tu reçois"
fr["catMeta"]["prix"]["eyebrow"] = "Ce que tu reçois"
fr["catMeta"]["prix"]["eyebrowSub"] = "Tout est inclus."
fr["catIntros"]["prix"] = C.PRIX

# — étape 3
fr["catMeta"]["temoignages"]["label"] = "Ils l'ont fait"
fr["catMeta"]["temoignages"]["eyebrow"] = "Ils l'ont fait"
fr["catIntros"]["temoignages"] = C.PREUVE_HEAD + fr["catIntros"]["temoignages"]

# — étape 4
fr["catMeta"]["infos"]["label"] = "Comment ça se passe"
fr["catMeta"]["infos"]["navLabel"] = "Comment ça se passe"
fr["catMeta"]["infos"]["eyebrow"] = "Comment ça se passe"
fr["catMeta"]["infos"]["eyebrowSub"] = "Lieu, dates, programme."
for old, new in C.REPL_INFOS:
    assert fr["catIntros"]["infos"].count(old) == 1, f"infos : {old[:60]}"
    fr["catIntros"]["infos"] = fr["catIntros"]["infos"].replace(old, new)

# — étape 5
fr["catMeta"]["expose"]["label"] = "Choisis ta place"
fr["catMeta"]["expose"]["navLabel"] = "Choisis ta place"
fr["catMeta"]["expose"]["eyebrow"] = "Choisis ta place"
fr["catMeta"]["expose"]["eyebrowSub"] = "Ton emplacement dans le tunnel."
for key in ("expose", "formats"):
    for old, new in C.REPL_FORMATS:
        if old in fr["catIntros"][key]:
            fr["catIntros"][key] = fr["catIntros"][key].replace(old, new)
# lien discret vers la FAQ de principe, à côté des tarifs
anchor = "<hr class=\"ib-sep\"><h3 class=\"ib-sub\"><i class=\"ti ti-stack-2\"></i> Réserve autant de places que tu veux.</h3>"
assert fr["catIntros"]["expose"].count(anchor) == 1
fr["catIntros"]["expose"] = fr["catIntros"]["expose"].replace(anchor, C.LIEN_FAQ_PAYER + anchor)

# — tuiles i18n (l'overlay est indexé : même ordre que TILES)
fr["TILES"] = [
    {"t": "L'idée", "s": "Remplacer la pub par de l'art"},
    {"t": "Ce que tu reçois", "s": "Tout ce qui est inclus"},
    {"t": "Ils l'ont fait", "s": "6 000 artistes depuis 2018"},
    {"t": "Comment ça se passe", "s": "Lieu, dates, programme"},
    {"t": "Choisis ta place", "s": "Formats, tailles, places"},
    {"t": "Notre histoire", "s": "Notre mission, qui nous sommes"},
    {"t": "FAQ", "s": "Recherche, thèmes, chat en direct"},
]

# — FAQ : correctifs + nouvelle entrée critique
Q = fr["FAQ"]
assert "Les prix montent quand les places se remplissent" in Q[14]["a"]
Q[14]["a"] = ("La participation commence <b>à partir de 49 €</b>, selon le format et la position. "
              "Un emplacement réservé ne revient pas, et rien ne garantit que le tarif d'aujourd'hui sera encore celui de demain. "
              "<a href=\"{PRICE}\" target=\"_blank\" rel=\"noopener\">Voir les places disponibles →</a>")
assert "jury" in Q[8]["q"]
Q[8]["q"] = "Faut-il être un artiste connu ou avoir un dossier ?"
Q[8]["a"] = "Non. <b>Une candidature simple, une réponse rapide.</b> Ton œuvre mérite d'être vue, pas de rester dans ton téléphone."
Q[33]["a"] = Q[33]["a"].replace("Une simple photo de bonne qualité suffit.", "Une simple photo suffit.")
Q.append(C.FAQ_PAYER)

s = s[:m.start(1)] + json.dumps(D, ensure_ascii=False) + s[m.end(1):]

# ════════════════════════════════════════════════════════════
# 3. CSS des nouveaux composants (§6 : les chiffres sont des images)
# ════════════════════════════════════════════════════════════
CSS = """<style>
/* --- v2 : hero sous-titre --- */
.hero-sub{max-width:620px;margin:16px auto 0;font-family:var(--font);font-size:clamp(.95rem,3.6vw,1.12rem);line-height:1.5;color:#c8d0de;text-wrap:balance}
/* --- v2 : les chiffres traités comme des chiffres --- */
.statrow{display:flex;gap:9px;margin:20px 0 0}
.stat{flex:1 1 0;min-width:0;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:14px 6px 12px;text-align:center}
.stat b{display:block;font-size:clamp(1.5rem,6.6vw,2.15rem);font-weight:800;color:#fff;line-height:1.05;font-variant-numeric:tabular-nums;white-space:nowrap}
.catview .stat span{display:block;font-size:.62rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-top:7px;line-height:1.25}
.catview .stat .stat-pre{margin:0 0 3px;font-size:.58rem;color:var(--faint)}
.stat-hot b{color:var(--accent)}
.stat-mute b{color:var(--faint)}
.catview .stat-cap{text-align:center;font-family:var(--font);font-size:1rem;font-weight:700;color:#fff;margin:14px 0 0}
.statrow-3 .stat b{font-size:clamp(1.15rem,5.4vw,1.9rem)}
.statrow-4 .stat b{font-size:clamp(1.1rem,4.6vw,1.6rem)}
.catview .statrow-4 .stat span{font-size:.56rem}
/* --- v2 : la révélation du prix --- */
.reveal{text-align:center;margin:26px 0 8px}
.catview .reveal-q{font-family:var(--serif);font-style:italic;font-size:clamp(1.1rem,4.4vw,1.4rem);color:#c8d0de;margin:0 0 14px}
.catview .reveal-a{font-family:var(--font);font-size:clamp(1.9rem,8vw,2.8rem);font-weight:800;color:#22e06b;line-height:1;margin:0}
.catview .reveal-n{font-size:.95rem;color:var(--muted);margin:14px 0 0;line-height:1.5}
/* --- v2 : hiérarchie des bénéfices --- */
.catview .recap-hero .recap-item p{font-size:1.05rem;line-height:1.55;color:#e6ebf4}
.recap-hero .tag-badge{font-size:.86rem}
.recap-more{margin-top:10px;opacity:.94}
.catview .recap-more .recap-item p{font-size:.9rem}
/* --- v2 : preuve (étape 3) --- */
.proof-fig{margin:0 0 4px}
.proof-stats{margin-top:16px}
.catview .proof-cap{font-size:.9rem;font-weight:500;color:var(--muted);margin-top:12px}
.catview .proof-link{text-align:center;margin:14px 0 26px}
.catview .fmt-faqlink{margin:14px 0 0;font-size:.9rem}
.fmt-faqlink a{color:var(--muted);text-decoration:underline;text-underline-offset:3px}
.fmt-faqlink a:hover{color:#fff}
@media(max-width:560px){
  .statrow{gap:7px}
  .statrow-4{flex-wrap:wrap}
  .statrow-4 .stat{flex:1 1 calc(50% - 4px)}
}
</style>"""
s = rep("</head>", CSS + "\n</head>", label="css v2")

# ════════════════════════════════════════════════════════════
# 4. BROUILLON : /florence-v2 est à la racine -> on force le FR
#    (la détection de langue renverrait "en" pour un 1er segment commençant par "florence")
# ════════════════════════════════════════════════════════════
DRAFT = 'if(location.pathname.toLowerCase().indexOf("florence-v2")>=0)return "fr";'
s = rep('window.__LANG=(function(){try{var LG=[\'fr\',\'en\',\'es\',\'it\',\'de\'];',
        'window.__LANG=(function(){try{var LG=[\'fr\',\'en\',\'es\',\'it\',\'de\'];' + DRAFT,
        label="__LANG brouillon")
s = rep('  function pickLang(){\n', '  function pickLang(){' + DRAFT + '\n', label="pickLang brouillon")
s = rep('function lg(){var p=(location.pathname.split("/")[1]||"").toLowerCase();return L[p]?p:"en";}',
        'function lg(){' + DRAFT + 'var p=(location.pathname.split("/")[1]||"").toLowerCase();return L[p]?p:"en";}',
        label="countdown brouillon")

# ════════════════════════════════════════════════════════════
# 5. BROUILLON : pas d'indexation
# ════════════════════════════════════════════════════════════
s = rep("<head>", "<head>\n<meta name=\"robots\" content=\"noindex,nofollow\">", label="noindex")

pathlib.Path(os.path.dirname(OUT)).mkdir(parents=True, exist_ok=True)
open(OUT, "w", encoding="utf-8").write(s)
print(f"✓ {N[0]} transformations appliquées")
print(f"✓ écrit : {OUT} ({len(s):,} o)")
