# -*- coding: utf-8 -*-
"""Contenu FR de la refonte PDV Florence (brief Copywriting du 15/09/2026).
Une seule source : build.py l'injecte dans le JS (fallback FR) ET dans window.__TR.fr."""

# ─────────────────────────────────────────────────────────────
# HERO — 3 variantes (§5.1). Défaut = A. Test : ?hero=B / ?hero=C
# ─────────────────────────────────────────────────────────────
HERO_VARS = {
  "A": {
    "t": "Et si on remplaçait la pub<br>par <span class=\"em\">de l'art</span>&nbsp;?",
    "s": "Ton œuvre exposée sur les écrans du Tunnel de l'Art Immersif, au cœur de Florence. 28 et 29 novembre 2026."
  },
  "B": {
    "t": "Ton œuvre mérite mieux<br>qu'<span class=\"em\">un feed</span>",
    "s": "Le 28 et 29 novembre, elle sera exposée dans un tunnel de 25 mètres au cœur de Florence, devant jusqu'à 100 000 visiteurs."
  },
  "C": {
    "t": "Cette fois, ton œuvre<br>sera <span class=\"em\">au-dessus d'eux</span>",
    "s": "Pour la première fois en 19 éditions, les œuvres sont aussi diffusées au plafond. Tunnel de l'Art Immersif, Florence, 28 et 29 novembre 2026."
  },
}

# ─────────────────────────────────────────────────────────────
# ÉTAPE 1 — L'IDÉE (nouvelle) : §5.2 mot pour mot
# ─────────────────────────────────────────────────────────────
IDEE = """
<div class="infobox">
  <figure class="ib-planfig"><img class="ib-plan" loading="eager" src="/florence/img/plan-florence4-1.jpg" alt="Le tunnel de l'Art Immersif au cœur de Florence — ton art ici"><span class="ib-arthere">Ton art<br>ici</span></figure>
  <div class="ib-body">

    <h2 class="ib-title">Un emplacement que les marques s'arrachent</h2>
    <div class="ib-txt">
      <p>Ce tunnel est un espace publicitaire. Normalement réservé aux grandes marques, qui paient plusieurs dizaines de milliers d'euros pour y afficher leur publicité.</p>
      <p>Notre mission est justement de remplacer la publicité par de l'Art, et de rendre ces espaces accessibles aux artistes du monde entier.</p>
      <p>Et on a obtenu mieux qu'une marque. Une publicité dispose d'environ 10 secondes d'affichage. Ton œuvre, elle, reste 30 secondes à l'écran.</p>
    </div>
    <div class="statrow statrow-2">
      <div class="stat stat-mute"><b>10 s</b><span>une publicité</span></div>
      <div class="stat stat-hot"><b>30 s</b><span>ton œuvre</span></div>
    </div>
    <p class="stat-cap">3× plus de temps d'écran qu'une grande marque.</p>

    <hr class="ib-sep">
    <h3 class="ib-sub"><i class="ti ti-clock-play"></i> Combien de temps mon œuvre sera-t-elle visible&nbsp;?</h3>
    <div class="ib-txt">
      <p><b>30 secondes, toutes les 4 à 5 minutes.</b> Non-stop, pendant 2 jours, de 7&nbsp;h à 21&nbsp;h.</p>
      <p>Soit plus de 330 passages sur les écrans, dans un tunnel traversé par environ 50 000 passages par jour — jusqu'à 100 000 visiteurs sur les deux jours.</p>
    </div>
    <div class="statrow statrow-3">
      <div class="stat"><b>330+</b><span>passages à l'écran</span></div>
      <div class="stat"><b>50 000</b><span>passages par jour</span></div>
      <div class="stat"><span class="stat-pre">jusqu'à</span><b>100 000</b><span>visiteurs en 2 jours</span></div>
    </div>

    <hr class="ib-sep">
    <div class="reveal">
      <p class="reveal-q">Imagine ce que ça coûte.</p>
      <p class="reveal-a">À partir de <span class="startprice" data-size="S">49 €</span></p>
      <p class="reveal-n">Parce qu'on partage l'emplacement entre des centaines d'artistes.</p>
    </div>

    <hr class="ib-sep">
    <h3 class="ib-sub"><i class="ti ti-arrow-big-up-lines"></i> Cette fois, ton œuvre sera aussi au-dessus d'eux</h3>
    <img class="ib-img" loading="lazy" src="/florence/img/tunnel-hero.jpg" alt="Les œuvres diffusées sur les murs et au plafond du tunnel">
    <div class="ib-txt">
      <p>Pour la première fois en 19 éditions, les œuvres sont aussi diffusées <b>au plafond</b>.</p>
      <p>25 mètres d'écrans LED sur les murs et au-dessus des têtes&nbsp;: les passants ne longent pas l'expo, ils entrent dedans. ✨</p>
    </div>

    <hr class="ib-sep">
    <h3 class="ib-sub"><i class="ti ti-qrcode"></i> Et ce n'est pas fini</h3>
    <div class="ib-txt">
      <p>Chaque œuvre est parfaitement visible et mise en valeur. 🎨</p>
      <p>Un QR code et un lien interactif renvoient directement vers ton site et tes réseaux — les passants te découvrent, et peuvent continuer à te suivre.</p>
      <p>Et tout est inclus&nbsp;: photos et vidéos professionnelles, Instagram Live, promotion ExpoMetro, certificat personnalisé.</p>
      <p>Du contenu pro que tu gardes, et que tu partages sur ta bio et tes réseaux.</p>
    </div>

    <hr class="ib-sep">
    <h3 class="ib-sub"><i class="ti ti-world"></i> Bien plus qu'une expo</h3>
    <div class="ib-txt">
      <p>Une expérience collective mondiale, avec des artistes venus du monde entier.</p>
      <p>Un réseau. Des rencontres. Des meetups à Florence.</p>
      <p>Et si tu ne peux pas venir, tu suis tout en direct sur Instagram Live — comme la plupart des artistes. 📱</p>
    </div>

    <hr class="ib-sep">
    <h3 class="ib-sub"><i class="ti ti-door-enter"></i> Zéro barrière à l'entrée</h3>
    <div class="ib-txt">
      <p>Ouvert à tous les artistes et photographes — professionnels, émergents ou amateurs.</p>
      <p>Abordable&nbsp;: à partir de <span class="startprice" data-size="S">49 €</span>.</p>
      <p>Accessible&nbsp;: une candidature simple, une réponse rapide. Pas de dossier à monter, pas de mois d'attente.</p>
      <p>Pas besoin d'être représenté par une galerie. Pas besoin d'être connu. Pas d'œuvre originale à expédier ni à assurer. Pas besoin de te déplacer.</p>
    </div>

    <div class="faq-bravo"><p><span class="bravo-sub">👉 Réserve ta place aujourd'hui, enregistre ton œuvre plus tard.</span></p></div>
    <div class="rt-cta-wrap"><a class="rt-cta" href="{PRICE}" target="_blank" rel="noopener">Expose ton œuvre</a></div>
  </div>
</div>
"""

# ─────────────────────────────────────────────────────────────
# ÉTAPE 2 — CE QUE TU REÇOIS (ex « Avantages »)
# hiérarchisé : 3 bénéfices dominants, puis le reste ; prix APRÈS la valeur.
# Le détail des dépenses part en FAQ (§5.3).
# ─────────────────────────────────────────────────────────────
PRIX = """
<div class="infobox">
  <img class="ib-cover" loading="lazy" src="/florence/img/tunnel-specs.jpg" alt="Le tunnel de l'Art Immersif 🇮🇹">
  <div class="ib-body">
    <div class="recap recap-hero">
      <div class="recap-item"><span class="tag-badge">🌍 Ton œuvre dans la ville</span><p>Exposée au cœur de Florence, dans un tunnel emprunté par environ 50 000 personnes par jour, entre la gare et la basilique Santa Maria Novella.</p></div>
      <div class="ib-sep-plus"><span>+</span></div>
      <div class="recap-item"><span class="tag-badge">✨ Murs et plafond</span><p>25 mètres d'écrans LED haute définition, sur les murs <b>et au plafond</b> — une première en 19 éditions. Les passants entrent au milieu des œuvres d'artistes du monde entier.</p></div>
      <div class="ib-sep-plus"><span>+</span></div>
      <div class="recap-item"><span class="tag-badge">📸 Du contenu pro que tu gardes</span><p>Photos et vidéos professionnelles de ton œuvre exposée. À partager sur ta bio, tes réseaux, ton site — bien après l'expo.</p></div>
    </div>

    <div class="recap recap-more">
      <div class="recap-item"><span class="tag-badge">📱 Interactif</span><p>Un QR code et un lien interactif sur ton œuvre renvoient vers ton site et tes réseaux.</p></div>
      <div class="ib-sep-plus"><span>+</span></div>
      <div class="recap-item"><span class="tag-badge">🎵 Musique</span><p>Les œuvres sont accompagnées de musique, pour une expérience visuelle et sonore hors norme.</p></div>
      <div class="ib-sep-plus"><span>+</span></div>
      <div class="recap-item"><span class="tag-badge">📜 Certificat</span><p>Tu reçois ton certificat de participation personnalisé.</p></div>
      <div class="ib-sep-plus"><span>+</span></div>
      <div class="recap-item"><span class="tag-badge">📣 Promotion</span><p>Ton œuvre est promue sur nos réseaux sociaux auprès de notre communauté.</p></div>
      <div class="ib-sep-plus"><span>+</span></div>
      <div class="recap-item"><span class="tag-badge">🔴 En direct</span><p>L'événement est retransmis sur Instagram Live&nbsp;: tu vois ton œuvre à l'écran et tu suis tout de chez toi.</p></div>
      <div class="ib-sep-plus"><span>+</span></div>
      <div class="recap-item"><span class="tag-badge">🎉 Événement</span><p>Le 1er jour, une grande journée d'ouverture avec plusieurs meetups (matin, après-midi et soir)&nbsp;: speech du Fondateur, photos et vidéos devant les œuvres, interviews d'artistes et un drink pour faire des rencontres.</p></div>
    </div>

    <div class="recap-total"><span class="rt-label">Total</span><span class="rt-val">À partir de <span class="startprice" data-size="S">49 €</span></span></div>

    <div class="msn-quote" style="margin:26px 0 6px"><img class="msn-q-photo" loading="lazy" src="/florence/img/rudolph-round.png" alt="Rudolph, Fondateur d'ExpoMetro"><blockquote class="big-quote">“Mon objectif est très simple&nbsp;: offrir l'exposition internationale la plus ouverte, abordable et accessible possible à tous les artistes et photographes, qu'ils soient professionnels, émergents ou amateurs.”<cite>— Rudolph, Fondateur</cite></blockquote></div>

    <hr class="ib-sep">
    <h3 class="ib-sub"><i class="ti ti-door-enter"></i> Zéro barrière à l'entrée</h3>
    <div class="ib-txt">
      <p>Pas besoin d'être représenté par une galerie. Pas besoin d'être connu.</p>
      <p>Pas d'œuvre originale à expédier ni à assurer&nbsp;: <b>une simple photo prise avec ton téléphone suffit</b>, et tu peux participer entièrement à distance.</p>
      <p>Une candidature simple, une réponse rapide. Pas de dossier à monter, pas de mois d'attente.</p>
    </div>

    <hr class="ib-sep">
    <h3 class="ib-sub"><i class="ti ti-calendar-repeat"></i> Et après Florence&nbsp;?</h3>
    <div class="ib-txt">
      <p>🌐 Ton œuvre reste accessible en ligne toute l'année sur le site ExpoMetro.</p>
      <p>👤 Ton profil artiste permet aux visiteurs de découvrir ton travail.</p>
      <p>🔗 Des liens directs vers ton site et tes réseaux permettent au public de continuer à te suivre après l'exposition.</p>
    </div>
  </div>
</div>
"""

# ─────────────────────────────────────────────────────────────
# ÉTAPE 3 — ILS L'ONT FAIT : en-tête de preuve ajouté avant les témoignages
# (chiffres vérifiés §7 : depuis 2018 · 19e édition · 6 000+ artistes · 100+ pays)
# ─────────────────────────────────────────────────────────────
PREUVE_HEAD = """
<figure class="ib-planfig proof-fig"><img class="ib-plan" loading="lazy" src="/florence/img/wt-madrid.jpg" alt="Les artistes réunis devant l'œuvre collective — Madrid 2026"></figure>
<div class="statrow statrow-4 proof-stats">
  <div class="stat"><b>2018</b><span>1re édition</span></div>
  <div class="stat"><b>19</b><span>éditions</span></div>
  <div class="stat"><b>6 000+</b><span>artistes</span></div>
  <div class="stat"><b>100+</b><span>pays</span></div>
</div>
<p class="stat-cap proof-cap">Paris, Londres, Berlin, New York, Milan, Barcelone, Rome, Madrid… et Florence.</p>
<p class="proof-link"><a class="see-link" data-open="apropos" href="#vision"><i class="ti ti-flag"></i> Notre histoire, depuis 2018 <span class="ar">→</span></a></p>
"""

# ─────────────────────────────────────────────────────────────
# FAQ — nouvelle entrée « Questions critiques » (§5.3)
# reprend le détail des dépenses retiré de l'étape 2
# ─────────────────────────────────────────────────────────────
FAQ_PAYER = {
  "c": "critiques",
  "q": "Un artiste ne devrait pas payer pour exposer",
  "k": "payer gratuit principe pay to play galerie commission cout depenses financement",
  "a": ("C'est une question de principe, et elle est légitime. Voilà notre réponse, en toute transparence.<br><br>"
        "📺 Nous louons pendant 2 jours un tunnel de 25 mètres entièrement équipé d'écrans LED sur les murs et le plafond, au cœur de Florence.<br><br>"
        "📍 C'est un emplacement publicitaire, normalement réservé aux grandes marques, dont la location coûte plusieurs dizaines de milliers d'euros.<br><br>"
        "📸 Nous finançons aussi les photographes et vidéastes professionnels, l'équipe sur place, la préparation technique, la promotion internationale, les QR codes, les certificats, les Instagram Live et les rencontres entre artistes.<br><br>"
        "Nous mutualisons tous ces coûts entre des centaines d'artistes&nbsp;: c'est ce qui permet une participation à partir de 49&nbsp;€.<br><br>"
        "Nous ne prenons aucune commission sur tes ventes, et nous ne demandons rien d'autre. 🎨<br><br>"
        "Nous n'avons pas de galerie à remplir&nbsp;: nous avons une publicité à remplacer par de l'art."),
  "feat": 0,
  "e": "🎨"
}

# ─────────────────────────────────────────────────────────────
# Remplacements ponctuels (§9 + §8 + §11) — (ancien, nouveau, où)
# ─────────────────────────────────────────────────────────────
REPL_INFOS = [
  ("<span class=\"k\">Audience :</span> 100 000 visiteurs",
   "<span class=\"k\">Audience :</span> jusqu'à 100 000 visiteurs"),
  ("<span class=\"k\">Temps d'affichage :</span> 30 secondes / minute<span class=\"desc\">Chaque composition d'œuvres reste affichée 30 secondes, et ton œuvre revient à l'écran toutes les 3 à 5 minutes (selon le nombre d'œuvres finales).</span>",
   "<span class=\"k\">Temps d'affichage :</span> 30 secondes, toutes les 4 à 5 minutes<span class=\"desc\">Chaque composition d'œuvres reste affichée 30 secondes, et ton œuvre revient à l'écran toutes les 4 à 5 minutes (selon le nombre d'œuvres finales).</span>"),
  ("<p class=\"bonasavoir\"><b>Bon à savoir :</b> Les grandes marques disposent généralement de 10 secondes d'affichage. ExpoMetro a obtenu pour ton art 3× plus de temps qu'une pub.</p>",
   "<p class=\"bonasavoir\">Une publicité dispose d'environ 10 secondes d'affichage. Ton œuvre, elle, reste 30 secondes à l'écran — 3× plus de temps qu'une grande marque.</p>"),
]

REPL_FORMATS = [
  ("<p class=\"fmt-note\">Premiers inscrits, premiers servis.<br>Réserve ta place aujourd'hui et enregistre ton œuvre plus tard.<br>Des nouvelles places seront ouvertes au fur et à mesure (places limitées).</p>",
   "<p class=\"fmt-note\">Premiers inscrits, premiers servis.<br>Réserve ta place aujourd'hui et enregistre ton œuvre plus tard.<br><b>Un emplacement réservé ne revient pas.</b> Et rien ne garantit que le tarif d'aujourd'hui sera encore celui de demain.</p>"),
  ("Une simple photo de bonne qualité suffit.", "Une simple photo suffit."),
  ("<i class=\"ti ti-eye\"></i> Voir le prix", "<i class=\"ti ti-eye\"></i> Voir les places"),
]

# lien discret vers l'entrée FAQ « Un artiste ne devrait pas payer pour exposer », à côté des tarifs
LIEN_FAQ_PAYER = ("<p class=\"fmt-faqlink\"><a data-open=\"faq\" href=\"#faq\">"
                  "🎨 «&nbsp;Un artiste ne devrait pas payer pour exposer&nbsp;» — ma réponse <span class=\"ar\">→</span></a></p>")
