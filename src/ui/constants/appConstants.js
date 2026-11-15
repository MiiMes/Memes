export const PROVIDERS = ["giphy", "tenor", "klipy"];

export const TRENDING_SEARCH_PROVIDERS = ["giphy", "tenor"];

export const PROVIDER_NAMES = { giphy: "GIPHY", tenor: "Tenor", klipy: "KLIPY" };

export const LOCALES = [
  ["sq_AL", "Albanian · Albania"],
  ["ar_EG", "Arabic · Egypt"],
  ["ar_SA", "Arabic · Saudi Arabia"],
  ["be_BY", "Belarusian · Belarus"],
  ["bn_BD", "Bengali · Bangladesh"],
  ["bs_BA", "Bosnian · Bosnia and Herzegovina"],
  ["zh_HK", "Cantonese · Hong Kong"],
  ["ca_ES", "Catalan · Spain"],
  ["zh_CN", "Chinese (Simplified) · China"],
  ["zh_TW", "Chinese (Traditional) · Taiwan"],
  ["hr_HR", "Croatian · Croatia"],
  ["cs_CZ", "Czech · Czechia"],
  ["da_DK", "Danish · Denmark"],
  ["nl_NL", "Dutch · Netherlands"],
  ["en_US", "English · United States"],
  ["en_GB", "English · United Kingdom"],
  ["en_CA", "English · Canada"],
  ["en_AU", "English · Australia"],
  ["en_IN", "English · India"],
  ["en_IE", "English · Ireland"],
  ["en_NZ", "English · New Zealand"],
  ["en_ZA", "English · South Africa"],
  ["fa_IR", "Farsi · Iran"],
  ["fi_FI", "Finnish · Finland"],
  ["fr_FR", "French · France"],
  ["fr_BE", "French · Belgium"],
  ["fr_CA", "French · Canada"],
  ["fr_CH", "French · Switzerland"],
  ["de_DE", "German · Germany"],
  ["de_AT", "German · Austria"],
  ["de_CH", "German · Switzerland"],
  ["el_GR", "Greek · Greece"],
  ["he_IL", "Hebrew · Israel"],
  ["hi_IN", "Hindi · India"],
  ["hu_HU", "Hungarian · Hungary"],
  ["id_ID", "Indonesian · Indonesia"],
  ["it_IT", "Italian · Italy"],
  ["ja_JP", "Japanese · Japan"],
  ["ko_KR", "Korean · South Korea"],
  ["lo_LA", "Lao · Laos"],
  ["ms_MY", "Malay · Malaysia"],
  ["mn_MN", "Mongolian · Mongolia"],
  ["no_NO", "Norwegian Bokmål · Norway"],
  ["nn_NO", "Norwegian Nynorsk · Norway"],
  ["pl_PL", "Polish · Poland"],
  ["pt_BR", "Portuguese · Brazil"],
  ["pt_PT", "Portuguese · Portugal"],
  ["ro_RO", "Romanian · Romania"],
  ["ru_RU", "Russian · Russia"],
  ["sr_RS", "Serbian · Serbia"],
  ["sk_SK", "Slovak · Slovakia"],
  ["es_ES", "Spanish · Spain"],
  ["es_MX", "Spanish · Mexico"],
  ["es_AR", "Spanish · Argentina"],
  ["es_CO", "Spanish · Colombia"],
  ["es_US", "Spanish · United States"],
  ["sv_SE", "Swedish · Sweden"],
  ["tl_PH", "Filipino/Tagalog · Philippines"],
  ["th_TH", "Thai · Thailand"],
  ["tr_TR", "Turkish · Türkiye"],
  ["uk_UA", "Ukrainian · Ukraine"],
  ["ur_PK", "Urdu · Pakistan"],
  ["vi_VN", "Vietnamese · Vietnam"],
];

export const GIPHY_LANGUAGES = new Set([
  "ar", "bn", "cs", "da", "de", "en", "es", "fa", "fi", "fr",
  "he", "hi", "hu", "id", "it", "ja", "ko", "ms", "nl", "no", "pl",
  "pt", "ro", "ru", "sv", "th", "tl", "tr", "uk", "vi", "zh",
]);

export const REACTIONS_BY_PROVIDER = {
  tenor: [
    "Good night", "Good morning", "Confused", "Chill out", "Love", "Happy",
    "Cry", "Yes", "No", "LOL", "Excited", "Bye", "Sorry", "Congratulations",
    "Sleepy", "Hello", "Hugs", "OK", "Please", "Thank you", "Miss you", "Wink",
    "Whatever", "Hungry", "Dance", "Annoyed", "OMG", "Crazy", "Shrug", "Smile",
    "Awkward", "EW", "Angry", "Surprised", "Why", "Thumbs up", "Wow", "Ouch",
    "Oops", "You're welcome", "Lazy", "Stressed", "Embarrassed", "Clapping",
    "Awesome", "JK", "Good luck", "High five", "Nervous", "Duh", "Aww", "Scared",
    "Bored", "Sigh", "Kiss", "Sad",
  ],
  giphy: [
    "Thank You", "Love", "Funny", "Yes", "Excited", "Kiss", "Hello", "Happy",
    "Sad", "No", "Crying", "Waiting", "Congratulations", "Yay", "Hug", "What",
    "Laughing", "Dancing", "Confused", "Wow", "Celebrate", "Shocked", "Thumbs Up",
    "WTF", "Tired", "LOL", "Nope", "Bye", "Angry", "Welcome", "OK", "Cute",
    "Miss You", "Sleepy", "Thinking", "Eye Roll", "Do It", "Side Eye", "Crazy",
    "Fire", "Scared", "Huh",
  ],
  klipy: [
    "Ok", "Win", "Laughing", "Confused", "Shocked", "Thank you", "Hug", "Awesome",
    "Hearts", "Drunk", "Help", "Sleepy", "Wow", "Hello", "Sexy", "Excited", "Omg",
    "Angry", "Wtf", "Mad", "Scared", "Sorry", "Whatever", "Good job", "Goodbye",
    "Proud", "Ugh", "Oops", "Rage", "Flirt", "Frustrated", "Popcorn", "Success",
    "Smh", "Disappointed", "Seriously", "Serious", "Shut up", "Burn", "Middle finger",
    "Sigh", "Deal with it", "Sarcastic", "Yawn", "Hair flip", "Want", "Yolo",
    "Thumbs down", "Meh", "Suspicious", "Mic drop", "Embarrassed", "Nom", "Good luck",
    "You got this", "Disgusted", "Awww", "Fist bump", "Eww", "Applause", "Happy dance",
    "Idk", "Do not want", "Amused", "Slow clap", "Oh snap", "Frown", "Pleased",
    "Rejected", "Not bad", "Judging you", "I give up", "Cool story bro", "Aroused",
    "Abandon thread", "Oh no you didnt", "Fml", "Interested", "What", "Bored", "Please",
    "Nod", "Agree", "Party hard", "Finger guns", "Table flip", "Love", "Dancing",
    "Smile", "Incredulous",
  ],
};

export const MEDIA_TYPES = [
  ["gif", "GIFs"],
  ["sticker", "Stickers"],
  ["clip", "Clips"],
];

export const TENOR_GIF_EXPLORE_CATEGORIES = [
  "Movies",
  "TV Shows",
  "Animals",
  "Food & Drink",
  "Greetings & Sayings",
  "Holidays",
  "Gestures",
  "Sports",
  "Celebrities",
  "Music",
  "Interests",
  "Internet",
  "Weather",
  "Places",
  "Memes",
];

export const API_ACTIONS = [
  ["search", "Search"],
  ["trending", "Trending media"],
  ["trending-searches", "Trending searches"],
  ["categories", "Categories"],
];

export const PROVIDER_CONFIG = {
  giphy: {
    key: import.meta.env.VITE_GIPHY_API_KEY ?? "",
  },
  tenor: {
    key: import.meta.env.VITE_TENOR_API_KEY ?? "",
    clientKey: import.meta.env.VITE_TENOR_CLIENT_KEY || "tenor_web",
  },
  klipy: {
    key: import.meta.env.VITE_KLIPY_API_KEY ?? "",
  },
};
