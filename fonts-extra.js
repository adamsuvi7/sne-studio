// SNE Studio — 518 font Google tambahan (nama sudah diverifikasi ke Google Fonts API).
// CSS tiap font baru dimuat SAAT DIBUTUHKAN (terlihat di strip / dipilih / dipakai layer), bukan di awal.
(function () {
  const EXTRA = {
    "serif": "Abhaya Libre:wght@400;700|Aboreto|Alegreya SC:wght@400;700|Alegreya:wght@400;700|Antic Didone|Arvo:wght@400;700|Bellefair|Belleza|Bentham|Bitter:wght@400;700|Bodoni Moda SC:wght@400;700|Bona Nova:wght@400;700|Brygada 1918:wght@400;700|Cantata One|Caudex:wght@400;700|Chonburi|Cormorant|Cormorant Infant|Cormorant Unicase|Cormorant Upright|Crimson Text:wght@400;700|DM Serif Text|Della Respira|Domine:wght@400;700|Eczar:wght@400;700|Elsie|Elsie Swash Caps|Fanwood Text|Faustina:wght@400;700|Fjord One|Gelasio:wght@400;700|Gowun Batang:wght@400;700|Hahmlet:wght@400;700|IM Fell DW Pica|IM Fell English|Kaisei Decol:wght@400;700|Libre Bodoni:wght@400;700|Libre Caslon Display|Libre Caslon Text:wght@400;700|Limelight|Literata:wght@400;700|Lustria|Marcellus SC|Mate SC|Noto Serif Display:wght@400;700|Noto Serif:wght@400;700|Old Standard TT:wght@400;700|Ovo|PT Serif:wght@400;700|Petrona:wght@400;700|Philosopher:wght@400;700|Playfair|Poly|Quattrocento:wght@400;700|Roboto Serif:wght@400;700|Roboto Slab:wght@400;700|Rosarivo|Rufina:wght@400;700|Sedan|Sedan SC|Sorts Mill Goudy|Source Serif 4:wght@400;700|Spectral SC:wght@400;700|Trirong:wght@400;700|Unna:wght@400;700|Viaoda Libre|Vollkorn:wght@400;700|Young Serif|Yrsa:wght@400;700|Zilla Slab:wght@400;700",
    "script": "Aguafina Script|Architects Daughter|Are You Serious|Arizonia|Babylonica|Ballet|Bilbo|Bilbo Swash Caps|Birthstone|Birthstone Bounce|Bonheur Royale|Borel|Butterfly Kids|Calligraffitti|Caramel|Carattere|Caveat Brush|Cedarville Cursive|Charm|Cherish|Comforter|Comforter Brush|Coming Soon|Condiment|Corinthia|Covered By Your Grace|Dawning of a New Day|Devonshire|Dr Sugiyama|Dynalight|Engagement|Ephesis|Estonia|Euphoria Script|Explora|Felipa|Fleur De Leah|Fondamento|Fuzzy Bubbles|Gochi Hand|Grechen Fuemen|Grey Qo|Gwendolyn|Handlee|Hurricane|Inspiration|Island Moments|Italianno|Just Another Hand|Kalam:wght@400;700|Kolker Brush|Lavishly Yours|League Script|Leckerli One|Licorice|Lily Script One|Love Light|Lovers Quarrel|Mansalva|Mea Culpa|Meddon|Meie Script|Merienda:wght@400;700|Miss Fajardose|Monsieur La Doulaise|Montez|Moon Dance|Mr De Haviland|Mrs Sheppards|Ms Madi|My Soul|Nanum Pen Script|Nerko One|Neucha|Norican|Ole|Oleo Script Swash Caps|Oleo Script:wght@400;700|Oooh Baby|Over the Rainbow|Pangolin|Passions Conflict|Patrick Hand|Petemoss|Petit Formal Script|Praise|Puppies Play|Qwigley|Qwitcher Grypen|Rancho|Redressed|Reenie Beanie|Rock Salt|Romanesco|Rouge Script|Ruthie|Sassy Frass|Schoolbell|Seaweed Script|Sedgwick Ave|Sedgwick Ave Display|Send Flowers|Sevillana|Shadows Into Light Two|Sofia|Square Peg|Sriracha|Stalemate|Style Script|Sue Ellen Francisco|The Nautigal|Twinkle Star|Updock|Vujahday Script|Waiting for the Sunrise|Waterfall|Whisper|WindSong|Yesteryear",
    "groovy": "Akronim|Allerta Stencil|Almendra Display|Anton SC|Astloch|Atomic Age|Bagel Fat One|Bahianita|Barriecito|Barrio|Bigelow Rules|Black Han Sans|Bowlby One|Bubblegum Sans|Bungee Hairline|Bungee Inline|Bungee Outline|Bungee Spice|Bungee Tint|Butcherman|Cabin Sketch:wght@400;700|Caesar Dressing|Caprasimo|Ceviche One|Chango|Cherry Bomb One|Chicle|Climate Crisis|Coiny|Corben:wght@400;700|Danfo|Dela Gothic One|Diplomata|Dokdo|DynaPuff:wght@400;700|Eater|Emilys Candy|Ewert|Fascinate|Fascinate Inline|Faster One|Flavors|Foldit|Fredericka the Great|Frijole|Fruktur|Galindo|Gasoek One|Gorditas|Grandstander:wght@400;700|Gravitas One|Griffy|Gugi|Hanalei|Hanalei Fill|Henny Penny|Honk|Irish Grover|Jacquard 12|Jacquard 24|Jacquarda Bastarda 9|Jolly Lodger|Joti One|Kablammo|Kalnia Glaze|Kavoon|Kenia|Kumar One|Lacquer|Lalezar|Londrina Outline|Londrina Shadow|Londrina Sketch|Londrina Solid|Love Ya Like A Sister|Macondo|Matemasie|McLaren|Metal Mania|Miltonian Tattoo|Mogra|Monofett|Moo Lah Lah|Mountains of Christmas:wght@400;700|Mystery Quest|Nabla|New Rocker|Nosifer|Oi|Original Surfer|Peralta|Piedra|Pirata One|Plaster|Poetsen One|Poller One|Potta One|Protest Guerrilla|Protest Revolution|Protest Riot|Protest Strike|Purple Purse|Racing Sans One|Rammetto One|Rampart One|Reggae One|Ribeye|Ribeye Marrow|Risque|RocknRoll One|Rowdies:wght@400;700|Rubik 80s Fade|Rubik Bubbles|Rubik Burned|Rubik Dirt|Rubik Distressed|Rubik Gemstones|Rubik Glitch|Rubik Iso|Rubik Marker Hatch|Rubik Maze|Rubik Microbe|Rubik Moonrocks|Rubik Puddles|Rubik Spray Paint|Rubik Storm|Rubik Vinyl|Rubik Wet Paint|Ruslan Display|Rye|Saira Stencil One|Sancreek|Sansita Swashed:wght@400;700|Sarina|Shojumaru|Sigmar|Sigmar One|Slackey|Smokum|Sniglet|Sonsie One|Spicy Rice|Spirax|Squada One|Stardos Stencil:wght@400;700|Stint Ultra Condensed|Sunshiney|Tilt Neon|Tilt Prism|Tilt Warp|Trade Winds|Train One|Trochut|Uncial Antiqua|UnifrakturMaguntia|Vast Shadow|Wendy One|Yatra One|Zen Tokyo Zoo|Zilla Slab Highlight",
    "sans": "Abel|Advent Pro:wght@400;700|Afacad:wght@400;700|Albert Sans:wght@400;700|Aldrich|Alumni Sans Pinstripe|Alumni Sans:wght@400;700|Antic|Antonio:wght@400;700|Anybody:wght@400;700|Archivo Narrow:wght@400;700|Archivo:wght@400;700;900|Asap Condensed:wght@400;700|Audiowide|Bai Jamjuree:wght@400;700|Baloo 2:wght@400;700|Barlow Semi Condensed:wght@400;700|Barlow:wght@400;700;900|Be Vietnam Pro:wght@400;700|BenchNine:wght@400;700|Big Shoulders Text:wght@400;700|Bruno Ace|Bruno Ace SC|Cabin:wght@400;700|Changa:wght@400;700|Comfortaa:wght@400;700|Darker Grotesque:wght@400;700;900|Days One|Dongle:wght@400;700|Dosis:wght@400;700|Economica:wght@400;700|Electrolize|Encode Sans Expanded:wght@400;700|Epilogue:wght@400;700;900|Familjen Grotesk:wght@400;700|Figtree:wght@400;700;900|Fira Sans Condensed:wght@400;700|Fira Sans Extra Condensed:wght@400;700|Fira Sans:wght@400;700|Funnel Display:wght@400;700|Gabarito:wght@400;700;900|Geist:wght@400;700|Geologica:wght@400;700|Goldman:wght@400;700|Golos Text:wght@400;700|Gruppo|Hanken Grotesk:wght@400;700|Heebo:wght@400;700|Host Grotesk:wght@400;700|Hubot Sans:wght@400;700|Iceland|Instrument Sans:wght@400;700|Inter Tight:wght@400;700|Jost:wght@400;700|Karla:wght@400;700|Khand:wght@400;700|Krona One|Kumbh Sans:wght@400;700|Lato:wght@400;700|League Gothic|Lexend Deca:wght@400;700|Lexend Giga:wght@400;700|Lexend Zetta:wght@400;700|Life Savers:wght@400;700|M PLUS Rounded 1c:wght@400;700|Megrim|Mona Sans:wght@400;700|Montserrat Alternates:wght@400;700|Montserrat Subrayada:wght@400;700|Mulish:wght@400;700|Nixie One|Nova Square|Nunito Sans:wght@400;700|Nunito:wght@400;700;900|Onest:wght@400;700|Open Sans:wght@400;700|Oxanium:wght@400;700|Oxygen:wght@400;700|PT Sans Narrow:wght@400;700|Parkinsans:wght@400;700|Pathway Gothic One|Quantico:wght@400;700|Raleway Dots|Raleway:wght@400;700;900|Rationale|Readex Pro:wght@400;700|Red Hat Display:wght@400;700;900|Reddit Sans:wght@400;700|Roboto Condensed:wght@400;700|Roboto Flex:wght@400;700|Roboto:wght@400;700;900|SUSE:wght@400;700|Saira Condensed:wght@400;700|Saira Extra Condensed:wght@400;700|Saira:wght@400;700|Sansita:wght@400;700|Schibsted Grotesk:wght@400;700|Secular One|Signika:wght@400;700|Six Caps|Smooch Sans:wght@400;700|Sofia Sans Condensed:wght@400;700|Sofia Sans Extra Condensed:wght@400;700|Sofia Sans:wght@400;700|Stick No Bills:wght@400;700|Text Me One|Thasadith:wght@400;700|Titillium Web:wght@400;700|Tomorrow:wght@400;700|Tulpen One|Turret Road:wght@400;700|Ubuntu:wght@400;700|Unica One|Varela Round|Viga|Wire One|Wix Madefor Display:wght@400;700|Yanone Kaffeesatz:wght@400;700|Zen Dots",
    "mono": "Anonymous Pro:wght@400;700|Azeret Mono:wght@400;700|B612 Mono:wght@400;700|Bitcount Single|Chivo Mono:wght@400;700|Codystar|Cousine:wght@400;700|DM Mono|DotGothic16|Doto:wght@400;700|Fragment Mono|Geist Mono:wght@400;700|Handjet:wght@400;700|Inconsolata:wght@400;700|Jacquard 12 Charted|Jersey 10|Jersey 15|Jersey 20|Jersey 25|Kode Mono:wght@400;700|Lekton:wght@400;700|Libre Barcode 128 Text|Libre Barcode 39 Text|Martian Mono:wght@400;700|Micro 5|Monomaniac One|Nanum Gothic Coding:wght@400;700|Nova Mono|Orbit|Overpass Mono:wght@400;700|Oxygen Mono|PT Mono|Pixelify Sans:wght@400;700|Red Hat Mono:wght@400;700|Reddit Mono:wght@400;700|Roboto Mono:wght@400;700|Rubik Pixels|Share Tech|Sixtyfour|Sometype Mono:wght@400;700|Sono:wght@400;700|Source Code Pro:wght@400;700|Spline Sans Mono:wght@400;700|Syne Mono|Tiny5|Ubuntu Mono:wght@400;700|Victor Mono:wght@400;700|Workbench|Xanh Mono|Zen Antique"
  };

  const spec = new Map();
  const sel = document.getElementById("inspectorFontSelect");
  for (const [cat, str] of Object.entries(EXTRA)) {
    const og = sel && sel.querySelector(`optgroup[data-cat="${cat}"]`);
    for (const item of str.split("|")) {
      const i = item.indexOf(":");
      const name = i < 0 ? item : item.slice(0, i);
      spec.set(name, i < 0 ? "" : item.slice(i + 1));
      if (og) og.appendChild(new Option(name, name));
    }
    if (og) og.label = og.label.replace(/\(\d+ Font\)/, `(${og.children.length} Font)`);
  }
  const total = sel ? sel.querySelectorAll("option").length : spec.size;
  const search = document.getElementById("fontSearchInput");
  if (search) search.placeholder = `Cari dari ${total} font (mis. Playfair, Roboto, Rubik, Script)...`;

  const requested = new Set();
  let queue = [], timer = 0;

  function flush() {
    while (queue.length) {
      const batch = queue.splice(0, 30);
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?" + batch.map((n) =>
        "family=" + encodeURIComponent(n).replace(/%20/g, "+") + (spec.get(n) ? ":" + spec.get(n) : "")).join("&") + "&display=swap";
      link.onload = () => {
        if (!document.fonts) return;
        Promise.all(batch.flatMap((n) => [document.fonts.load(`400 24px "${n}"`), document.fonts.load(`700 24px "${n}"`)]))
          .catch(() => {})
          .then(() => { if (typeof renderCanvas === "function") renderCanvas(); window.dispatchEvent(new Event("sne-fonts")); });
      };
      document.head.appendChild(link);
    }
  }

  // Minta CSS sebuah font tambahan; aman dipanggil berulang (mis. tiap render kanvas).
  function ensure(name) {
    if (!spec.has(name) || requested.has(name)) return;
    requested.add(name);
    queue.push(name);
    clearTimeout(timer);
    timer = setTimeout(flush, 40);
  }

  // names/has dipakai Editor Video untuk pustaka font yang sama
  window.SNEFonts = { ensure, total, names: [...spec.keys()], has: (n) => spec.has(n) };
})();
