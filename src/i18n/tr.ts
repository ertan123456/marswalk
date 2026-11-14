/**
 * Turkish.
 *
 * Typed as `Messages`, so this file cannot drift from `en.ts`: add a key there
 * and this stops compiling until it is translated here.
 *
 * Register note: this is a flight console, so the Turkish is the plain,
 * declarative register a controller would use — not the softened, marketing
 * Turkish that creeps into translated software. Established aerospace terms
 * stay in the form Turkish speakers actually use ("EVA", "rover", "HUD");
 * translating them would make the console harder to read, not easier.
 */

import type { Messages } from './en';

export const tr: Messages = {
  // --- shell -------------------------------------------------------------
  'app.tagline': 'EVA planlayıcı',
  'app.place': 'Gale Krateri — Aşağı Mount Sharp',
  'app.sol': 'sol {n}',
  'app.window': 'pencere',
  'app.status': 'durum',
  'app.guidedDemo': 'rehberli demo',
  'app.language': 'Dil',
  'app.languageEnglish': 'English',
  'app.languageTurkish': 'Türkçe',

  'mode.plan': 'PLAN',
  'mode.3d': '3B',
  'mode.hud': 'HUD',
  'mode.briefing': 'BRİFİNG',
  'mode.data': 'VERİ',
  'mode.planTitle': 'Habitat planlama ekranı',
  'mode.3dTitle': 'Araziyi üç boyutlu gör',
  'mode.hudTitle': 'Mürettebatın vizörü',
  'mode.briefingTitle': 'Görev brifingi',
  'mode.dataTitle': 'Kaynaklar ve veri kökeni',

  // --- rails and panels --------------------------------------------------
  'rail.layers': 'katmanlar',
  'rail.instruments': 'enstrümanlar',
  'rail.leftLabel': 'Sol ray içeriği',
  'rail.drawerLabel': 'Çekmece içeriği',
  'rail.planLabel': 'Plan rayı içeriği',
  'rail.stations': 'istasyonlar',
  'rail.charts': 'grafikler',
  'rail.ai': 'yapay zekâ',

  'panel.dataLayers': 'Veri katmanları',
  'panel.reset': 'sıfırla',
  'panel.resetTitle': 'Tüm analiz katmanlarını gizle',
  'panel.opacity': 'opaklık',
  'panel.howMade': 'bu katman nasıl üretildi',
  'panel.source': 'kaynak ↗',
  'panel.notShaded': ' — boyanmıyor',
  'panel.chart': 'grafik',

  'map.measure': 'ölç',
  'map.measureTitle': 'Mesafe ölç ve yükseklik profili çıkar',
  'map.label': 'Planlama haritası',
  'map.layersTitle': 'Veri katmanlarını ve enstrümanları göster',
  'map.planTitle': 'EVA planını ve Mission AI’ı göster',
  'map.close': 'kapat',
  'map.closeTitle': 'Bu paneli kapat (Esc)',

  // --- plan --------------------------------------------------------------
  'plan.title': 'EVA güzergâhı',
  'plan.solving': 'çözülüyor',
  'plan.traverse': 'güzergâh',
  'plan.duration': 'EVA süresi',
  'plan.consumablesLeft': 'kalan sarf malzeme',
  'plan.dose': 'EVA dozu',
  'plan.airlockOut': 'hava kilidi çıkış',
  'plan.airlockIn': 'hava kilidi giriş',
  'plan.onFoot': 'yaya',
  'plan.roverAssisted': 'rover destekli',
  'plan.driven': '{d} sürüldü',
  'plan.walked': '{d} yüründü',
  'plan.noDismount': 'iniş gerekmiyor',
  'plan.flightRule': 'uçuş kuralı',
  'plan.spe': 'uzay havası önlemi',
  'plan.scienceStations': 'Bilim istasyonları',
  'plan.elevationProfile': 'Yükseklik profili',
  'plan.walkBack': 'Dönüş kontrolü',
  'plan.charts': 'Grafikler',
  'plan.chartsEmpty': 'Grafikler rota çözüldüğünde görünür. En az bir istasyon ekleyin.',
  'plan.walkBackNote':
    'Mürettebat EVA’yı herhangi bir anda bırakıp %{pct} rezervine dokunmadan güvenli bir sığınağa ulaşabilmeli. Kırmızı çizgi yeşilin üstüne çıktığı yerde bu artık geçerli değil.',
  'station.arrive': 'varış',
  'station.leg': 'etap',
  'station.dropOff': 'rover bırakma',
  'station.onStation': 'istasyonda',
  'station.consumablesAtDepart': 'ayrılışta sarf malzeme',
  'station.walkBackMargin': 'dönüş payı',
  'station.returnToHaven': 'sığınağa dönüş',
  'plan.targetBrief': 'Hedef brifingi · {code}',

  'layer.optical-base': 'Yörünge taban haritası',
  'layer.dem-elevation': 'Yükseklik (DTM)',
  'layer.dem-slope': 'Eğim',
  'layer.mobility-hazards': 'Hareket tehlikeleri',
  'layer.geochem-units': 'Jeokimyasal birimler',
  'layer.science-regions': 'Bilim bölgeleri',
  'layer.science-waypoints': 'Bilim noktaları',
  'layer.curiosity-traverse': 'Curiosity’nin gittiği yol',
  'layer.rad-dose-rate': 'Radyasyon doz hızı',
  'layer.rems-weather': 'Yüzey hava durumu',

  'group.Base': 'Taban',
  'group.Terrain': 'Arazi',
  'group.Geology & Minerals': 'Jeoloji ve mineraller',
  'group.Safety': 'Güvenlik',
  'group.Environment': 'Çevre',

  'plan.traverseRover': 'güzergâh (sürülen + yürünen)',
  'plan.traverseHint': '{driven} sürüldü, {foot} yaya',
  'plan.consumablesHint': 'Bütçe {budget} sa nominal iş yükünde; rezerv %{reserve}',

  'verdict.go': 'UYGUN',
  'verdict.noGo': 'UYGUN DEĞİL',
  'verdict.goDetail': 'Planlanan pencere için tüm uçuş kuralları sağlanıyor.',

  // --- mission ai --------------------------------------------------------
  'ai.title': 'Mission AI',
  'ai.localAnalyst': 'yerel analist',
  'ai.localAnalystTitle': 'Çözülmüş plandan tarayıcıda hesaplanan deterministik analiz',
  'ai.modelTitle': 'Yerel bir dil modeli tarafından yanıtlandı ({model})',
  'ai.ask': 'sor',
  'ai.thinking': 'düşünüyor…',
  'ai.limitReached': 'limit doldu',
  'ai.placeholder': 'Rotayı, dönüş payını, veriyi sorun…',
  'ai.placeholderSpent': 'Günlük limit doldu',
  'ai.inputLabel': 'Mission AI’a plan hakkında soru sorun',
  'ai.askTitle': 'Mission AI’a sor (Enter)',
  'ai.remaining': 'bugün {n}/{total}',
  'ai.safety': 'güvenlik {n}/100',
  'ai.riskLow': 'DÜŞÜK risk',
  'ai.riskMedium': 'ORTA risk',
  'ai.riskHigh': 'YÜKSEK risk',
  'ai.standingNote':
    'Her mesafe, sarf malzeme değeri, dönüş payı ve karar planlayıcı tarafından hesaplanır, model tarafından değil — asistan yalnızca bunları açıklar. Deterministik analist tarayıcıda çalışır ve her zaman kullanılabilir; erişilebilir bir yerel Ollama modeli varsa onun yerine o kullanılır, yayınlanmış statik sitede ise yoktur.',

  'rail.science': 'bilim',

  // --- investigations ----------------------------------------------------
  'inv.title': 'Hangi araştırma, nerede',
  'inv.intro':
    'Bir araştırma seçin, EVA ona göre yeniden zamanlanır: mürettebat, çalışacak zemini olan her istasyonda o işin gerektirdiği kadar kalır. Aşağıdaki mesafeler elle yazılmadı, CRISM birim haritasından ölçüldü.',
  'inv.loading': 'Jeokimya katmanı bekleniyor…',
  'inv.clear': 'temizle',
  'inv.clearTitle': 'Her istasyonu yeniden kendi amacına göre planla',
  'inv.minPerStation': 'dk/istasyon',
  'inv.groundArea': 'AOI içinde {km2} km² uygun zemin',
  'inv.noStation':
    'Hiçbir istasyonun {m} m içinde uygun zemini yok. Bu araştırma bu güzergâhta yapılamaz.',
  'inv.caveat':
    'Hiçbir istasyon haritalanmış bir birimin üstünde durmuyor. İstasyonlar Curiosity’nin ölçülmüş konumları, birimler ise CRISM’in spektral sapma gösterdiği yerler. Gösterilen mesafe mürettebatın istasyondan ne kadar uzağa yürümesi gerektiğidir; {m} m, hedefin desteksiz sayıldığı sınırdır.',
  'inv.provenance':
    'Birimler AOI’nin %{pct}’ini kaplıyor; eşik, her sahnenin kendi arka planının {k} sağlam standart sapma üstü. Görev süreleri NASA’nın değil, bizim.',

  'inv.onTraverse': 'Planlanan güzergâhta: bu araştırma onu yeniden zamanlıyor',
  'inv.offTraverse': 'Planlanan güzergâhta değil',
  'inv.addStation':
    'Bu istasyonların hiçbiri planlanan güzergâhta değil, bu yüzden bu araştırmayı seçmek hiçbir süreyi değiştirmez. Önce istasyonlar sekmesinden birini ekleyin.',

  'inv.clay.label': 'Kil mineralojisi',
  'inv.clay.question': 'Burada su, kayacı değiştirecek kadar uzun durdu mu?',
  'inv.clay.rationale':
    'Sondaj yap, örneği işle ve analiz et. Smektit uzaktan bir görüntüyle doğrulanamaz; listenin en uzunu olmasının sebebi bu.',
  'inv.tuff.label': 'Tüf alterasyonu',
  'inv.tuff.question': 'Burası volkanik kül müydü, su ona ne yaptı?',
  'inv.tuff.rationale':
    'Fırçala, yakın çek, sonra sondaj yap. Opalin silika ve Al-OH ince alterasyon kabuklarında durur; yüzey kalkmadan ölçüm bir şey ifade etmez.',
  'inv.riverbed.label': 'Nehir yatağı sedimentolojisi',
  'inv.riverbed.question': 'Burada su aktı mı, hangi yöne?',
  'inv.riverbed.rationale':
    'Tabakalanma ve tane boyu görüntüleme ve temas çalışmasıyla okunur, sondaj gerekmez. Cevap kimyada değil, yapıda.',
  'inv.sulfate.label': 'Sülfat stratigrafisi',
  'inv.sulfate.question': 'Su ne zaman çekildi?',
  'inv.sulfate.rationale':
    'Ölçülü bir kesiti fırçala ve nokta spektrometresiyle tara. İstasyon başına birkaç gözlem gerektiği için düz görüntülemeden uzun sürer.',
  'inv.hydration.label': 'Hidratasyon taraması',
  'inv.hydration.question': 'Bağlı su neye bağlı?',
  'inv.hydration.rationale':
    'Her durakta hızlı bir spektrometre geçişi. Bilerek kısa: tek bir noktayı çözmek için değil, çok istasyonu kapsamak için tasarlandı.',
  'inv.mafic.label': 'Mafik köken',
  'inv.mafic.question': 'Bu malzeme nereden geldi?',
  'inv.mafic.rationale':
    'Görüntüleme ve bir el örneği. Piroksen ve olivin sondaj olmadan tanınabilir; listenin en ucuzu bu.',

  // --- thermal -----------------------------------------------------------
  'plan.coldCost': 'soğuk bedeli',
  'plan.coldCostHint':
    'Tulum ısıtması, diğer her şifle aynı bütçeden: çıkışta soğumuş tulumu ısıtmak {soak} dk, geri kalanı yol boyunca ısıtma. Hava kilidi çıkışında {start}°C, girişte {end}°C. Ölçüm değil, model.',

  // --- landing -----------------------------------------------------------
  'landing.eyebrow': 'NASA Space Apps Challenge 2026',
  'landing.start': 'Görev planlamasını başlat',
  'landing.demo': 'Rehberli demo · {n}sn',
};
