export interface ChromeStrings {
  checkbox_label: string;
  brand: string;
  verified: string;
  popup_title: string;
  popup_body: string;
  popup_button: string;
  aria_label: string;
  aria_close: string;
  /** Shown in the checkbox slot during a penalty lockout (Phase 7). */
  locked_out: string;
}

export const SUPPORTED_LOCALES = [
  'en', 'es', 'fr', 'de', 'pt', 'it', 'nl', 'ja', 'ko', 'zh-CN', 'zh-TW',
  'ar', 'he', 'fa', 'ru', 'hi', 'tr', 'pl',
] as const;

const RTL_LOCALES: Record<string, 1> = { ar: 1, he: 1, fa: 1 };

export function isRTL(locale: string): boolean {
  return RTL_LOCALES[locale] === 1;
}

/** Normalize a raw lang tag to a supported locale, else 'en'. Ported from api.js 95-111. */
export function resolveLocale(input: string | undefined | null): string {
  if (!input || typeof input !== 'string') return 'en';
  const tag = input.split(',')[0].trim().toLowerCase();
  if (tag === '') return 'en';
  const parts = tag.split('-');
  if (parts[0] === 'zh') {
    for (let i = 1; i < parts.length; i++) {
      const p = parts[i];
      if (p === 'hant' || p === 'tw' || p === 'hk' || p === 'mo') return 'zh-TW';
    }
    return 'zh-CN';
  }
  for (let j = 0; j < SUPPORTED_LOCALES.length; j++) {
    if (SUPPORTED_LOCALES[j] === parts[0]) return SUPPORTED_LOCALES[j];
  }
  return 'en';
}

/** The 18-locale chrome string table. Copied verbatim from api.js. */
export const STRINGS: Record<string, ChromeStrings> = {
  en: {
    checkbox_label: 'I am not a robot',
    brand: 'ProofMark Verify',
    verified: 'Verified',
    popup_title: 'Verify in a new window',
    popup_body: 'Your browser blocked the in-page verifier. Click below to open it in a new window. The window will close itself when done.',
    popup_button: 'Open verification window',
    aria_label: 'I am not a robot. ProofMark Verify human verification.',
    aria_close: 'Close verification',
    locked_out: 'Verification temporarily locked. Try again later.',
  },
  es: {
    checkbox_label: 'No soy un robot',
    brand: 'ProofMark Verify',
    verified: 'Verificado',
    popup_title: 'Verificar en una nueva ventana',
    popup_body: 'Tu navegador bloqueó el verificador en la página. Pulsa abajo para abrirlo en una ventana nueva. La ventana se cerrará sola al terminar.',
    popup_button: 'Abrir ventana de verificación',
    aria_label: 'No soy un robot. Verificación humana de ProofMark Verify.',
    aria_close: 'Cerrar verificación',
    locked_out: 'Verificación bloqueada temporalmente. Inténtalo más tarde.',
  },
  fr: {
    checkbox_label: 'Je ne suis pas un robot',
    brand: 'ProofMark Verify',
    verified: 'Vérifié',
    popup_title: 'Vérifier dans une nouvelle fenêtre',
    popup_body: 'Votre navigateur a bloqué le vérificateur. Cliquez ci-dessous pour l’ouvrir dans une nouvelle fenêtre. Elle se fermera automatiquement.',
    popup_button: 'Ouvrir la fenêtre de vérification',
    aria_label: 'Je ne suis pas un robot. Vérification humaine ProofMark Verify.',
    aria_close: 'Fermer la vérification',
    locked_out: 'Vérification temporairement verrouillée. Réessayez plus tard.',
  },
  de: {
    checkbox_label: 'Ich bin kein Roboter',
    brand: 'ProofMark Verify',
    verified: 'Verifiziert',
    popup_title: 'In neuem Fenster verifizieren',
    popup_body: 'Ihr Browser hat die Inline-Verifizierung blockiert. Klicken Sie unten, um sie in einem neuen Fenster zu öffnen. Das Fenster schließt sich nach Abschluss.',
    popup_button: 'Verifizierungsfenster öffnen',
    aria_label: 'Ich bin kein Roboter. ProofMark Verify Mensch-Prüfung.',
    aria_close: 'Verifizierung schließen',
    locked_out: 'Verifizierung vorübergehend gesperrt. Später erneut versuchen.',
  },
  pt: {
    checkbox_label: 'Não sou um robô',
    brand: 'ProofMark Verify',
    verified: 'Verificado',
    popup_title: 'Verificar em uma nova janela',
    popup_body: 'Seu navegador bloqueou o verificador na página. Clique abaixo para abrir em uma nova janela. A janela fechará sozinha ao terminar.',
    popup_button: 'Abrir janela de verificação',
    aria_label: 'Não sou um robô. Verificação humana ProofMark Verify.',
    aria_close: 'Fechar verificação',
    locked_out: 'Verificação temporariamente bloqueada. Tente novamente mais tarde.',
  },
  it: {
    checkbox_label: 'Non sono un robot',
    brand: 'ProofMark Verify',
    verified: 'Verificato',
    popup_title: 'Verifica in una nuova finestra',
    popup_body: 'Il browser ha bloccato il verificatore. Clicca sotto per aprirlo in una nuova finestra. Si chiuderà da sola al termine.',
    popup_button: 'Apri finestra di verifica',
    aria_label: 'Non sono un robot. Verifica umana ProofMark Verify.',
    aria_close: 'Chiudi verifica',
    locked_out: 'Verifica temporaneamente bloccata. Riprova più tardi.',
  },
  nl: {
    checkbox_label: 'Ik ben geen robot',
    brand: 'ProofMark Verify',
    verified: 'Geverifieerd',
    popup_title: 'Verifiëren in een nieuw venster',
    popup_body: 'Uw browser heeft de inline-verificatie geblokkeerd. Klik hieronder om in een nieuw venster te openen. Het sluit zichzelf wanneer klaar.',
    popup_button: 'Verificatievenster openen',
    aria_label: 'Ik ben geen robot. Menselijke verificatie van ProofMark Verify.',
    aria_close: 'Verificatie sluiten',
    locked_out: 'Verificatie tijdelijk vergrendeld. Probeer het later opnieuw.',
  },
  ja: {
    checkbox_label: '私はロボットではありません',
    brand: 'ProofMark Verify',
    verified: '確認完了',
    popup_title: '新しいウィンドウで確認',
    popup_body: 'ブラウザがページ内の確認をブロックしました。下のボタンで新しいウィンドウを開いてください。完了後ウィンドウは自動で閉じます。',
    popup_button: '確認ウィンドウを開く',
    aria_label: '私はロボットではありません。ProofMark Verify による人間確認。',
    aria_close: '確認を閉じる',
    locked_out: '確認は一時的にロックされています。しばらくしてから再度お試しください。',
  },
  ko: {
    checkbox_label: '저는 로봇이 아닙니다',
    brand: 'ProofMark Verify',
    verified: '확인됨',
    popup_title: '새 창에서 확인',
    popup_body: '브라우저가 페이지 내 확인을 차단했습니다. 아래를 클릭해 새 창에서 열어주세요. 완료 후 창이 자동으로 닫힙니다.',
    popup_button: '확인 창 열기',
    aria_label: '저는 로봇이 아닙니다. ProofMark Verify 인간 확인.',
    aria_close: '확인 닫기',
    locked_out: '확인이 일시적으로 잠겼습니다. 나중에 다시 시도하세요.',
  },
  'zh-CN': {
    checkbox_label: '我不是机器人',
    brand: 'ProofMark Verify',
    verified: '已验证',
    popup_title: '在新窗口中验证',
    popup_body: '您的浏览器阻止了页内验证。点击下方在新窗口中打开,完成后窗口将自动关闭。',
    popup_button: '打开验证窗口',
    aria_label: '我不是机器人。ProofMark Verify 真人验证。',
    aria_close: '关闭验证',
    locked_out: '验证已暂时锁定,请稍后再试。',
  },
  'zh-TW': {
    checkbox_label: '我不是機器人',
    brand: 'ProofMark Verify',
    verified: '已驗證',
    popup_title: '在新視窗中驗證',
    popup_body: '您的瀏覽器阻止了頁內驗證。點擊下方在新視窗中開啟,完成後視窗將自動關閉。',
    popup_button: '開啟驗證視窗',
    aria_label: '我不是機器人。ProofMark Verify 真人驗證。',
    aria_close: '關閉驗證',
    locked_out: '驗證已暫時鎖定,請稍後再試。',
  },
  ar: {
    checkbox_label: 'أنا لست برنامج روبوت',
    brand: 'ProofMark Verify',
    verified: 'تم التحقق',
    popup_title: 'التحقق في نافذة جديدة',
    popup_body: 'حجب متصفحك أداة التحقق داخل الصفحة. انقر أدناه لفتحها في نافذة جديدة، وستُغلق تلقائيًا عند الانتهاء.',
    popup_button: 'فتح نافذة التحقق',
    aria_label: 'أنا لست برنامج روبوت. التحقق البشري بواسطة ProofMark Verify.',
    aria_close: 'إغلاق التحقق',
    locked_out: 'تم قفل التحقق مؤقتًا. حاول مرة أخرى لاحقًا.',
  },
  he: {
    checkbox_label: 'אני לא רובוט',
    brand: 'ProofMark Verify',
    verified: 'מאומת',
    popup_title: 'אימות בחלון חדש',
    popup_body: 'הדפדפן שלך חסם את האימות בעמוד. לחץ למטה כדי לפתוח בחלון חדש. החלון ייסגר בעצמו בסיום.',
    popup_button: 'פתח חלון אימות',
    aria_label: 'אני לא רובוט. אימות אנושי של ProofMark Verify.',
    aria_close: 'סגור אימות',
    locked_out: 'האימות נעול באופן זמני. נסה שוב מאוחר יותר.',
  },
  fa: {
    checkbox_label: 'من ربات نیستم',
    brand: 'ProofMark Verify',
    verified: 'تأیید شد',
    popup_title: 'تأیید در پنجره جدید',
    popup_body: 'مرورگر شما تأیید درون‌صفحه‌ای را مسدود کرد. برای باز کردن در پنجره جدید کلیک کنید. پنجره پس از پایان به‌طور خودکار بسته می‌شود.',
    popup_button: 'باز کردن پنجره تأیید',
    aria_label: 'من ربات نیستم. تأیید انسانی ProofMark Verify.',
    aria_close: 'بستن تأیید',
    locked_out: 'تأیید به‌طور موقت قفل شده است. بعداً دوباره تلاش کنید.',
  },
  ru: {
    checkbox_label: 'Я не робот',
    brand: 'ProofMark Verify',
    verified: 'Проверено',
    popup_title: 'Проверка в новом окне',
    popup_body: 'Браузер заблокировал проверку на странице. Нажмите ниже, чтобы открыть в новом окне. Оно закроется автоматически.',
    popup_button: 'Открыть окно проверки',
    aria_label: 'Я не робот. Проверка человека ProofMark Verify.',
    aria_close: 'Закрыть проверку',
    locked_out: 'Проверка временно заблокирована. Повторите попытку позже.',
  },
  hi: {
    checkbox_label: 'मैं रोबोट नहीं हूँ',
    brand: 'ProofMark Verify',
    verified: 'सत्यापित',
    popup_title: 'नई विंडो में सत्यापित करें',
    popup_body: 'आपके ब्राउज़र ने पेज पर सत्यापन रोक दिया। नई विंडो में खोलने के लिए नीचे क्लिक करें। पूरा होने पर विंडो स्वयं बंद हो जाएगी।',
    popup_button: 'सत्यापन विंडो खोलें',
    aria_label: 'मैं रोबोट नहीं हूँ। ProofMark Verify द्वारा मानव सत्यापन।',
    aria_close: 'सत्यापन बंद करें',
    locked_out: 'सत्यापन अस्थायी रूप से लॉक है। कृपया बाद में पुनः प्रयास करें।',
  },
  tr: {
    checkbox_label: 'Ben robot değilim',
    brand: 'ProofMark Verify',
    verified: 'Doğrulandı',
    popup_title: 'Yeni pencerede doğrula',
    popup_body: 'Tarayıcınız sayfa içi doğrulayıcıyı engelledi. Yeni pencerede açmak için aşağıya tıklayın. Pencere bittiğinde kendiliğinden kapanacak.',
    popup_button: 'Doğrulama penceresini aç',
    aria_label: 'Ben robot değilim. ProofMark Verify insan doğrulaması.',
    aria_close: 'Doğrulamayı kapat',
    locked_out: 'Doğrulama geçici olarak kilitlendi. Daha sonra tekrar deneyin.',
  },
  pl: {
    checkbox_label: 'Nie jestem robotem',
    brand: 'ProofMark Verify',
    verified: 'Zweryfikowano',
    popup_title: 'Weryfikuj w nowym oknie',
    popup_body: 'Twoja przeglądarka zablokowała weryfikację w stronie. Kliknij poniżej, aby otworzyć w nowym oknie. Okno zamknie się samo po zakończeniu.',
    popup_button: 'Otwórz okno weryfikacji',
    aria_label: 'Nie jestem robotem. Weryfikacja człowieka ProofMark Verify.',
    aria_close: 'Zamknij weryfikację',
    locked_out: 'Weryfikacja tymczasowo zablokowana. Spróbuj później.',
  },
};

/** Look up a locale's strings, falling back to English. */
export function strings(locale: string): ChromeStrings {
  return STRINGS[locale] || STRINGS.en;
}
