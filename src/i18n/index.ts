import { getLocales } from 'expo-localization';

/**
 * Small translation layer. t('key') returns the active language's text, falling back to English,
 * so a missing translation never shows a blank. {name} placeholders are filled from vars.
 */
export type Lang = 'en' | 'hi';
export const LANGS: { id: Lang; name: string }[] = [
  { id: 'en', name: 'English' }, { id: 'hi', name: 'हिन्दी' },
];

const en = {
  'tab.home': 'Home', 'tab.bills': 'Bills', 'tab.reports': 'Reports', 'tab.more': 'More',
  'greet.morning': 'Good morning', 'greet.afternoon': 'Good afternoon', 'greet.evening': 'Good evening',
  'home.earnedToday': 'Earned today', 'home.worked': '{time} worked', 'home.timerRunning': 'timer running',
  'home.last7': 'Last 7 days', 'home.thisMonth': 'This month', 'home.toCollect': 'To collect', 'home.setGoal': 'Set goal',
  'home.monthGoal': 'month goal', 'home.startWork': 'Start work', 'home.startTrip': 'Start trip', 'home.startRental': 'Start rental',
  'home.alreadyRunning': 'Already running', 'home.log': 'Log {what}', 'home.noTimer': 'Charged per {unit} · no timer needed',
  'home.gpsHint': 'GPS counts the {dist} while you drive', 'home.odoHint': "You'll note the {dist} on the dashboard at start and end",
  'home.meterHint': "You'll note the machine's hours counter at start and end", 'home.dayHint': 'Days are counted when it comes back',
  'home.timerHint': 'Timer runs until you tap Stop', 'home.change': 'Change', 'home.forgot': 'Forgot to start? Add it now',
  'home.pastTrip': 'Add a past trip', 'home.recent': 'Recent work', 'home.seeAll': 'See all',
  'home.unbilled': '{amount} of work not billed yet', 'home.billNow': 'Bill now', 'home.overdue': '{amount} overdue', 'home.remind': 'Remind',
  'run.running': 'RUNNING', 'run.break': 'ON BREAK', 'run.soFar': 'so far', 'run.breakBtn': 'Break', 'run.resume': 'Resume', 'run.stop': 'Stop',
  'run.startedLate': 'Started late?', 'run.gpsCounted': 'counted by GPS',
  'stop.title': 'Finish this job?', 'stop.whenStop': 'When did you actually stop?', 'stop.justNow': 'Just now', 'stop.minAgo': '{n} min ago',
  'stop.keep': 'Keep running', 'stop.save': 'Save', 'stop.note': 'Note (optional)',
  'bills.title': 'Bills', 'bills.new': 'New bill', 'bills.waiting': 'Waiting for payment', 'bills.notBilled': 'Not billed yet',
  'bills.ready': 'Ready to bill', 'bills.one': 'One customer', 'bills.everyone': 'Bill everyone',
  'bill.send': 'Send on WhatsApp', 'bill.sendAgain': 'Send again', 'bill.totalDue': 'Total due', 'bill.preview': 'Preview bill',
  'bill.paymentReceived': 'Payment received', 'bill.confirmed': 'Confirmed by customer', 'bill.disputed': 'Disputed by customer',
  'more.title': 'More', 'more.prices': 'Prices', 'more.allWork': 'All work', 'more.toCollect': 'To collect', 'more.quotes': 'Quotes',
  'more.expenses': 'Expenses', 'more.team': 'Team', 'more.language': 'Language', 'more.measureField': 'Measure a field',
  'common.save': 'Save', 'common.cancel': 'Cancel', 'common.continue': 'Continue', 'common.back': 'Back', 'common.add': 'Add',
  'setup.name': 'What should we call your business?', 'setup.nameHint': 'This name goes at the top of your bills. Your own name is fine.',
  'setup.country': 'Country', 'setup.how': 'How do you charge?', 'setup.howHint': 'Pick the closest one. You can add other ways later.',
  'setup.price': 'Your price', 'setup.first': 'Who is your first {who}?', 'setup.finish': 'Finish setup',
  'welcome.title': 'Measure the work.\nGet paid faster.',
  'welcome.body': 'Hours, km, days or jobs — bill on WhatsApp, let customers confirm, and see who owes you. Works offline.',
  'welcome.have': 'I already have an account', 'welcome.what': 'What kind of work do you do?',
  'confirm.ask': 'Ask the customer to confirm', 'confirm.sent': 'Waiting for the customer to confirm',
};
type Key = keyof typeof en;

const hi: Partial<Record<Key, string>> = {
  'tab.home': 'होम', 'tab.bills': 'बिल', 'tab.reports': 'रिपोर्ट', 'tab.more': 'और',
  'greet.morning': 'सुप्रभात', 'greet.afternoon': 'नमस्ते', 'greet.evening': 'शुभ संध्या',
  'home.earnedToday': 'आज की कमाई', 'home.worked': '{time} काम', 'home.timerRunning': 'टाइमर चालू',
  'home.last7': 'पिछले 7 दिन', 'home.thisMonth': 'इस महीने', 'home.toCollect': 'बाकी वसूली', 'home.setGoal': 'लक्ष्य रखें',
  'home.monthGoal': 'महीने का लक्ष्य', 'home.startWork': 'काम शुरू करें', 'home.startTrip': 'ट्रिप शुरू करें', 'home.startRental': 'किराया शुरू करें',
  'home.alreadyRunning': 'पहले से चालू', 'home.log': '{what} लिखें', 'home.noTimer': 'हर {unit} का चार्ज · टाइमर की ज़रूरत नहीं',
  'home.gpsHint': 'चलाते समय GPS {dist} गिनता है', 'home.odoHint': 'शुरू और अंत में डैशबोर्ड का {dist} लिखें',
  'home.meterHint': 'शुरू और अंत में मशीन का घंटा मीटर लिखें', 'home.dayHint': 'वापस आने पर दिन गिने जाते हैं',
  'home.timerHint': 'स्टॉप दबाने तक टाइमर चलता है', 'home.change': 'बदलें', 'home.forgot': 'शुरू करना भूल गए? अभी जोड़ें',
  'home.pastTrip': 'पुरानी ट्रिप जोड़ें', 'home.recent': 'हाल का काम', 'home.seeAll': 'सब देखें',
  'home.unbilled': '{amount} का काम अभी बिल नहीं हुआ', 'home.billNow': 'बिल बनाएं', 'home.overdue': '{amount} बकाया', 'home.remind': 'याद दिलाएं',
  'run.running': 'चालू', 'run.break': 'ब्रेक पर', 'run.soFar': 'अब तक', 'run.breakBtn': 'ब्रेक', 'run.resume': 'फिर शुरू', 'run.stop': 'रोकें',
  'run.startedLate': 'देर से शुरू किया?', 'run.gpsCounted': 'GPS से गिना',
  'stop.title': 'काम पूरा करें?', 'stop.whenStop': 'असल में कब रुके?', 'stop.justNow': 'अभी', 'stop.minAgo': '{n} मिनट पहले',
  'stop.keep': 'चालू रखें', 'stop.save': 'सेव करें', 'stop.note': 'नोट (वैकल्पिक)',
  'bills.title': 'बिल', 'bills.new': 'नया बिल', 'bills.waiting': 'भुगतान बाकी', 'bills.notBilled': 'अभी बिल नहीं हुआ',
  'bills.ready': 'बिल के लिए तैयार', 'bills.one': 'एक ग्राहक', 'bills.everyone': 'सबका बिल',
  'bill.send': 'WhatsApp पर भेजें', 'bill.sendAgain': 'फिर भेजें', 'bill.totalDue': 'कुल बकाया', 'bill.preview': 'बिल देखें',
  'bill.paymentReceived': 'भुगतान मिला', 'bill.confirmed': 'ग्राहक ने पुष्टि की', 'bill.disputed': 'ग्राहक ने आपत्ति की',
  'more.title': 'और', 'more.prices': 'दाम', 'more.allWork': 'सारा काम', 'more.toCollect': 'बाकी वसूली', 'more.quotes': 'कोटेशन',
  'more.expenses': 'खर्च', 'more.team': 'टीम', 'more.language': 'भाषा', 'more.measureField': 'खेत नापें',
  'common.save': 'सेव करें', 'common.cancel': 'रद्द करें', 'common.continue': 'आगे', 'common.back': 'पीछे', 'common.add': 'जोड़ें',
  'setup.name': 'आपके कारोबार का नाम क्या है?', 'setup.nameHint': 'यह नाम बिल के ऊपर आएगा। अपना नाम भी चलेगा।',
  'setup.country': 'देश', 'setup.how': 'आप कैसे चार्ज करते हैं?', 'setup.howHint': 'सबसे नज़दीकी चुनें। बाद में और जोड़ सकते हैं।',
  'setup.price': 'आपका दाम', 'setup.first': 'आपका पहला {who} कौन है?', 'setup.finish': 'सेटअप पूरा करें',
  'welcome.title': 'काम नापें।\nजल्दी पैसा पाएं।',
  'welcome.body': 'घंटे, किमी, दिन या काम — WhatsApp पर बिल भेजें, ग्राहक से पुष्टि लें, और देखें किसका बकाया है। बिना इंटरनेट भी चलता है।',
  'welcome.have': 'मेरा खाता पहले से है', 'welcome.what': 'आप कौन सा काम करते हैं?',
  'confirm.ask': 'ग्राहक से पुष्टि लें', 'confirm.sent': 'ग्राहक की पुष्टि का इंतज़ार',
};

const DICTS: Record<Lang, Partial<Record<Key, string>>> = { en, hi };

function deviceLang(): Lang {
  try {
    const code = getLocales()[0]?.languageCode ?? 'en';
    return code === 'hi' ? 'hi' : 'en';
  } catch {
    return 'en';
  }
}

let lang: Lang = deviceLang();
export const setLang = (l: string | null | undefined) => { lang = l === 'hi' || l === 'en' ? l : deviceLang(); };
export const currentLang = () => lang;

export function t(key: Key, vars?: Record<string, string | number>): string {
  let s = (DICTS[lang][key] ?? en[key]) as string;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** The phone's country, e.g. "GB", for pre-filling setup. */
export function deviceRegionCode(): string | null {
  try { return getLocales()[0]?.regionCode ?? null; } catch { return null; }
}
