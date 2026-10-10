// Generates a realistic Hungarian lecture-notes PDF for end-to-end testing.
// Usage: node scripts/make-test-pdf.mjs [output path]
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFileSync, writeFileSync } from "fs";

const OUT = process.argv[2] || "test-notes.pdf";
const FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
const FONT_BOLD_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";

const PAGES = [
  {
    title: "A fotoszintézis — előadásjegyzet (1/3)",
    body: [
      "A fotoszintézis az a biokémiai folyamat, amelynek során a zöld növények, algák és egyes baktériumok fényenergiát kémiai energiává alakítanak. A folyamat nyersanyagai a szén-dioxid (CO2) és a víz (H2O), a végtermékek pedig a glükóz (C6H12O6) és az oxigén (O2).",
      "A folyamat helye a levélben található kloroplasztisz. Ennek belső membránrendszerében, a tilakoidokon ül a fotoszintézis pigmentje, a klorofill. A klorofill a vörös és a kék fényt nyeli el, a zöldet visszaveri — ezért zöld a levél.",
      "A fotoszintézis összegzett egyenlete: 6 CO2 + 6 H2O + fényenergia -> C6H12O6 + 6 O2. Fontos: az oxigén a víz bontásából származik, nem a CO2-ból. Ezt izotópjelölési kísérletek bizonyították (18O-val jelölt víz).",
      "A fotoszintézis két nagy szakaszból áll: a fényfázis (világosfüggő) és a sötétfázis (Calvin-ciklus, világosfüggetlen) szakaszból.",
    ],
  },
  {
    title: "A fényfázis — előadásjegyzet (2/3)",
    body: [
      "A fényfázis a tilakoidmembránon zajlik. A fényenergia hatására a klorofill elektronjai gerjednek, és az elektrontranszport-láncba lépnek. A víz fotolízise során a vízmolekulák szétbomlanak: ez adja az oxigént, a protonokat és az elektronokat.",
      "A fényfázis termékei: ATP és NADPH. Az ATP szintézise a kemiozmotikus elmélet szerint történik: a protonok koncentrációkülönbsége (protongradiens) hajtja az ATP-szintáz enzimet. Ezt Mitchell dolgozta ki 1961-ben, kémiai Nobel-díj.",
      "Kétféle fotoszisztéma van: a PSII (P680) és a PSI (P700). A Z-séma szerint az elektronok a PSII-ből plasztokinonon keresztül a citokróm b6f komplexhez, majd plasztocianinon át a PSI-be jutnak, onnan NADP+ -hoz, amely NADPH-vá redukálódik.",
      "A nem ciklikus elektrontranszport eredménye ATP + NADPH + O2. A ciklikus elektrontranszportban az elektron visszajut a PSI-ből, csak ATP keletkezik, NADPH nem.",
    ],
  },
  {
    title: "A sötétfázis (Calvin-ciklus) — előadásjegyzet (3/3)",
    body: [
      "A Calvin-ciklus a sztrómában zajlik, és nem igényel közvetlenül fényt. Három fő lépése: 1) CO2 megkötése: a RuBisCO enzim a CO2-t a ribulóz-1,5-biszfoszfáthoz (RuBP) kapcsolja; 2) redukció: az ATP és a NADPH felhasználásával 3-foszfoglicerátból gliceraldehid-3-foszfát (G3P) lesz; 3) regeneráció: a RuBP újraképződik.",
      "Minden megkötött CO2-hoz 3 ATP és 2 NADPH szükséges. Egy glükóz felépítéséhez a ciklus hatszor fut át, tehát 18 ATP és 12 NADPH a teljes költség.",
      "A RuBisCO a Föld leggyakoribb enzime, de lassú és hibázik is: néha O2-t köt meg CO2 helyett. Ez a fotorespiráció, amely energiaveszteséggel jár.",
      "A C4-es növények (kukorica, cukornád) a meleg éghajlaton a fotorespirációt kerülik el: először a mesophyll-sejtben PEP-karboxilázzal kötik meg a CO2-t, majd a kötejhüvelysejtekben adják át a Calvin-ciklusnak. A CAM növények (kaktusz) éjszaka nyitják a sztómáikat.",
      "Összefoglalva: a fotoszintézis a bioszféra energia- és oxigénforrása. Évente kb. 100-115 milliárd tonna szenet kötnek meg így a növények.",
    ],
  },
];

const doc = await PDFDocument.create();
doc.registerFontkit(fontkit);
const font = await doc.embedFont(readFileSync(FONT_PATH));
const bold = await doc.embedFont(readFileSync(FONT_BOLD_PATH));

for (const page of PAGES) {
  const p = doc.addPage([595, 842]);
  let y = 780;
  p.drawText(page.title, { x: 60, y, size: 16, font: bold, color: rgb(0.1, 0.1, 0.4) });
  y -= 40;
  for (const para of page.body) {
    // naive wrap at ~90 chars
    const words = para.split(" ");
    let line = "";
    const lines = [];
    for (const w of words) {
      if ((line + " " + w).length > 88) {
        lines.push(line);
        line = w;
      } else {
        line = line ? `${line} ${w}` : w;
      }
    }
    if (line) lines.push(line);
    for (const l of lines) {
      p.drawText(l, { x: 60, y, size: 11, font });
      y -= 16;
    }
    y -= 12;
  }
}

const bytes = await doc.save();
writeFileSync(OUT, bytes);
console.log(`wrote ${OUT} (${bytes.length} bytes)`);
