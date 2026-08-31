const SOURCE_TRAVEL_AIRPORTS = [
  {
    sourceId: "khi",
    name: "Jinnah International Airport",
    iataCode: "KHI",
    country: "Pakistan",
  },
  {
    sourceId: "lhe",
    name: "Allama Iqbal International Airport",
    iataCode: "LHE",
    country: "Pakistan",
  },
  {
    sourceId: "isb",
    name: "Islamabad International Airport",
    iataCode: "ISB",
    country: "Pakistan",
  },
  {
    sourceId: "pew",
    name: "Bacha Khan International Airport (Peshawar)",
    iataCode: "PEW",
    country: "Pakistan",
  },
  {
    sourceId: "uet",
    name: "Quetta International Airport",
    iataCode: "UET",
    country: "Pakistan",
  },
  {
    sourceId: "mux",
    name: "Multan International Airport",
    iataCode: "MUX",
    country: "Pakistan",
  },
  {
    sourceId: "skt",
    name: "Sialkot International Airport",
    iataCode: "SKT",
    country: "Pakistan",
  },
  {
    sourceId: "lyp",
    name: "Faisalabad International Airport",
    iataCode: "LYP",
    country: "Pakistan",
  },
  {
    sourceId: "gwd",
    name: "Jinnah International Airport Gwadar",
    iataCode: "GWD",
    country: "Pakistan",
  },
  {
    sourceId: "tuk",
    name: "Turbat International Airport",
    iataCode: "TUK",
    country: "Pakistan",
  },
  {
    sourceId: "kdu",
    name: "Skardu Airport",
    iataCode: "KDU",
    country: "Pakistan",
  },
  {
    sourceId: "gil",
    name: "Gilgit Airport",
    iataCode: "GIL",
    country: "Pakistan",
  },
  {
    sourceId: "ryk",
    name: "Rahim Yar Khan Airport",
    iataCode: "RYK",
    country: "Pakistan",
  },
  {
    sourceId: "bhv",
    name: "Bahawalpur Airport",
    iataCode: "BHV",
    country: "Pakistan",
  },
  {
    sourceId: "hdd",
    name: "Hyderabad (Sindh) Airport",
    iataCode: "HDD",
    country: "Pakistan",
  },
  {
    sourceId: "wns",
    name: "Nawabshah (Shaheed Benazirabad) Airport",
    iataCode: "WNS",
    country: "Pakistan",
  },
  {
    sourceId: "dea",
    name: "Dera Ghazi Khan Airport",
    iataCode: "DEA",
    country: "Pakistan",
  },
  {
    sourceId: "skz",
    name: "Sukkur Airport",
    iataCode: "SKZ",
    country: "Pakistan",
  },
  {
    sourceId: "bnp",
    name: "Bannu Airport",
    iataCode: "BNP",
    country: "Pakistan",
  },

  {
    sourceId: "lhr",
    name: "Heathrow Airport",
    iataCode: "LHR",
    country: "United Kingdom",
  },
  {
    sourceId: "lgw",
    name: "Gatwick Airport",
    iataCode: "LGW",
    country: "United Kingdom",
  },
  {
    sourceId: "man",
    name: "Manchester Airport",
    iataCode: "MAN",
    country: "United Kingdom",
  },
  {
    sourceId: "jfk",
    name: "John F. Kennedy International Airport",
    iataCode: "JFK",
    country: "United States",
  },
  {
    sourceId: "ewr",
    name: "Newark Liberty International Airport",
    iataCode: "EWR",
    country: "United States",
  },
  {
    sourceId: "lax",
    name: "Los Angeles International Airport",
    iataCode: "LAX",
    country: "United States",
  },
  {
    sourceId: "ord",
    name: "O'Hare International Airport",
    iataCode: "ORD",
    country: "United States",
  },
  {
    sourceId: "dfw",
    name: "Dallas/Fort Worth International Airport",
    iataCode: "DFW",
    country: "United States",
  },
  {
    sourceId: "den",
    name: "Denver International Airport",
    iataCode: "DEN",
    country: "United States",
  },
  {
    sourceId: "mia",
    name: "Miami International Airport",
    iataCode: "MIA",
    country: "United States",
  },
  {
    sourceId: "sfo",
    name: "San Francisco International Airport",
    iataCode: "SFO",
    country: "United States",
  },

  {
    sourceId: "ist",
    name: "Istanbul Airport",
    iataCode: "IST",
    country: "Turkey",
  },
  {
    sourceId: "ayt",
    name: "Antalya Airport",
    iataCode: "AYT",
    country: "Turkey",
  },
  {
    sourceId: "ams",
    name: "Amsterdam Airport Schiphol",
    iataCode: "AMS",
    country: "Netherlands",
  },
  {
    sourceId: "cdg",
    name: "Charles de Gaulle Airport",
    iataCode: "CDG",
    country: "France",
  },
  {
    sourceId: "ory",
    name: "Orly Airport",
    iataCode: "ORY",
    country: "France",
  },
  {
    sourceId: "fco",
    name: "Leonardo da Vinci–Fiumicino Airport",
    iataCode: "FCO",
    country: "Italy",
  },
  {
    sourceId: "mxp",
    name: "Malpensa Airport",
    iataCode: "MXP",
    country: "Italy",
  },
  {
    sourceId: "mad",
    name: "Adolfo Suárez Madrid–Barajas Airport",
    iataCode: "MAD",
    country: "Spain",
  },
  {
    sourceId: "bcn",
    name: "Barcelona–El Prat Airport",
    iataCode: "BCN",
    country: "Spain",
  },
  {
    sourceId: "fra",
    name: "Frankfurt Airport",
    iataCode: "FRA",
    country: "Germany",
  },
  {
    sourceId: "muc",
    name: "Munich Airport",
    iataCode: "MUC",
    country: "Germany",
  },
  {
    sourceId: "hel",
    name: "Helsinki Airport",
    iataCode: "HEL",
    country: "Finland",
  },
  {
    sourceId: "vce",
    name: "Venice Marco Polo Airport",
    iataCode: "VCE",
    country: "Italy",
  },
  {
    sourceId: "zrh",
    name: "Zurich Airport",
    iataCode: "ZRH",
    country: "Switzerland",
  },
  {
    sourceId: "gva",
    name: "Geneva Airport",
    iataCode: "GVA",
    country: "Switzerland",
  },
  {
    sourceId: "cph",
    name: "Copenhagen Airport",
    iataCode: "CPH",
    country: "Denmark",
  },
  {
    sourceId: "osl",
    name: "Oslo Gardermoen Airport",
    iataCode: "OSL",
    country: "Norway",
  },
  {
    sourceId: "arn",
    name: "Stockholm Arlanda Airport",
    iataCode: "ARN",
    country: "Sweden",
  },

  {
    sourceId: "bkk",
    name: "Suvarnabhumi Airport",
    iataCode: "BKK",
    country: "Thailand",
  },
  {
    sourceId: "dmk",
    name: "Don Mueang International Airport",
    iataCode: "DMK",
    country: "Thailand",
  },
  {
    sourceId: "hkg",
    name: "Hong Kong International Airport",
    iataCode: "HKG",
    country: "Hong Kong",
  },
  {
    sourceId: "sin",
    name: "Changi Airport",
    iataCode: "SIN",
    country: "Singapore",
  },
  {
    sourceId: "kix",
    name: "Kansai International Airport",
    iataCode: "KIX",
    country: "Japan",
  },
  {
    sourceId: "nrt",
    name: "Narita International Airport",
    iataCode: "NRT",
    country: "Japan",
  },
  {
    sourceId: "han",
    name: "Noi Bai International Airport",
    iataCode: "HAN",
    country: "Vietnam",
  },
  {
    sourceId: "sgn",
    name: "Tan Son Nhat International Airport",
    iataCode: "SGN",
    country: "Vietnam",
  },
  {
    sourceId: "bom",
    name: "Chhatrapati Shivaji Maharaj International Airport",
    iataCode: "BOM",
    country: "India",
  },
  {
    sourceId: "del",
    name: "Indira Gandhi International Airport",
    iataCode: "DEL",
    country: "India",
  },
  {
    sourceId: "hyd",
    name: "Rajiv Gandhi International Airport",
    iataCode: "HYD",
    country: "India",
  },
  {
    sourceId: "bey",
    name: "Beirut–Rafic Hariri International Airport",
    iataCode: "BEY",
    country: "Lebanon",
  },

  {
    sourceId: "ruh",
    name: "King Khalid International Airport",
    iataCode: "RUH",
    country: "Saudi Arabia",
  },
  {
    sourceId: "jed",
    name: "King Abdulaziz International Airport",
    iataCode: "JED",
    country: "Saudi Arabia",
  },
  {
    sourceId: "med",
    name: "Prince Mohammad bin Abdulaziz Airport",
    iataCode: "MED",
    country: "Saudi Arabia",
  },
  {
    sourceId: "dmm",
    name: "King Fahd International Airport",
    iataCode: "DMM",
    country: "Saudi Arabia",
  },
  {
    sourceId: "auh",
    name: "Abu Dhabi International Airport",
    iataCode: "AUH",
    country: "United Arab Emirates",
  },
  {
    sourceId: "dxb",
    name: "Dubai International Airport",
    iataCode: "DXB",
    country: "United Arab Emirates",
  },
  {
    sourceId: "shj",
    name: "Sharjah International Airport",
    iataCode: "SHJ",
    country: "United Arab Emirates",
  },
  {
    sourceId: "doh",
    name: "Hamad International Airport",
    iataCode: "DOH",
    country: "Qatar",
  },

  {
    sourceId: "bna",
    name: "Nashville International Airport",
    iataCode: "BNA",
    country: "United States",
  },
  {
    sourceId: "yyz",
    name: "Toronto Pearson International Airport",
    iataCode: "YYZ",
    country: "Canada",
  },
  {
    sourceId: "yvr",
    name: "Vancouver International Airport",
    iataCode: "YVR",
    country: "Canada",
  },
  {
    sourceId: "yhz",
    name: "Halifax Stanfield International Airport",
    iataCode: "YHZ",
    country: "Canada",
  },
  {
    sourceId: "yul",
    name: "Montréal–Trudeau International Airport",
    iataCode: "YUL",
    country: "Canada",
  },
  {
    sourceId: "syd",
    name: "Sydney Kingsford Smith Airport",
    iataCode: "SYD",
    country: "Australia",
  },
  {
    sourceId: "mel",
    name: "Melbourne Airport",
    iataCode: "MEL",
    country: "Australia",
  },
  {
    sourceId: "bne",
    name: "Brisbane Airport",
    iataCode: "BNE",
    country: "Australia",
  },
  {
    sourceId: "akl",
    name: "Auckland Airport",
    iataCode: "AKL",
    country: "New Zealand",
  },
  {
    sourceId: "cpt",
    name: "Cape Town International Airport",
    iataCode: "CPT",
    country: "South Africa",
  },
  {
    sourceId: "jnb",
    name: "O. R. Tambo International Airport",
    iataCode: "JNB",
    country: "South Africa",
  },
  {
    sourceId: "add",
    name: "Addis Ababa Bole International Airport",
    iataCode: "ADD",
    country: "Ethiopia",
  },
  {
    sourceId: "acc",
    name: "Kotoka International Airport",
    iataCode: "ACC",
    country: "Ghana",
  },
  {
    sourceId: "los",
    name: "Murtala Muhammed International Airport",
    iataCode: "LOS",
    country: "Nigeria",
  },
  {
    sourceId: "dwc",
    name: "Al Maktoum International Airport",
    iataCode: "DWC",
    country: "United Arab Emirates",
  },
  {
    sourceId: "meb",
    name: "Essendon (small)",
    iataCode: "MEB",
    country: "Australia",
  },
  {
    sourceId: "bhx",
    name: "Birmingham Airport",
    iataCode: "BHX",
    country: "United Kingdom",
  },
  {
    sourceId: "edi",
    name: "Edinburgh Airport",
    iataCode: "EDI",
    country: "United Kingdom",
  },
  {
    sourceId: "svg",
    name: "Stavanger Airport",
    iataCode: "SVG",
    country: "Norway",
  },
  {
    sourceId: "tpe",
    name: "Taiwan Taoyuan International Airport",
    iataCode: "TPE",
    country: "Taiwan",
  },

  /*
   * Original calculator source میں یہ تین placeholder/alternate
   * records بھی موجود ہیں، لیکن ان کے codes valid 3-letter IATA
   * codes نہیں ہیں، اس لیے database seed سے exclude کیے جاتے ہیں:
   *
   * KHI2 - Second Karachi (placeholder)
   * DMK2 - Don Mueang (secondary)
   * KHIA - Karachi (alternate)
   */

  {
    sourceId: "pty",
    name: "Tocumen International Airport",
    iataCode: "PTY",
    country: "Panama",
  },
  {
    sourceId: "scl",
    name: "Comodoro Arturo Merino Benítez International Airport",
    iataCode: "SCL",
    country: "Chile",
  },
  {
    sourceId: "eze",
    name: "Ministro Pistarini International Airport",
    iataCode: "EZE",
    country: "Argentina",
  },
  {
    sourceId: "gru",
    name: "São Paulo–Guarulhos International Airport",
    iataCode: "GRU",
    country: "Brazil",
  },
  {
    sourceId: "gig",
    name: "Rio de Janeiro–Galeão International Airport",
    iataCode: "GIG",
    country: "Brazil",
  },
  {
    sourceId: "prg",
    name: "Václav Havel Airport Prague",
    iataCode: "PRG",
    country: "Czech Republic",
  },
  {
    sourceId: "waw",
    name: "Warsaw Chopin Airport",
    iataCode: "WAW",
    country: "Poland",
  },
  {
    sourceId: "bud",
    name: "Budapest Ferenc Liszt International Airport",
    iataCode: "BUD",
    country: "Hungary",
  },
  {
    sourceId: "sof",
    name: "Sofia Airport",
    iataCode: "SOF",
    country: "Bulgaria",
  },
  {
    sourceId: "ath",
    name: "Athens International Airport",
    iataCode: "ATH",
    country: "Greece",
  },
  {
    sourceId: "lis",
    name: "Lisbon Portela Airport",
    iataCode: "LIS",
    country: "Portugal",
  },
  {
    sourceId: "lga",
    name: "LaGuardia Airport",
    iataCode: "LGA",
    country: "United States",
  },
  {
    sourceId: "mdw",
    name: "Midway International Airport",
    iataCode: "MDW",
    country: "United States",
  },
  {
    sourceId: "phl",
    name: "Philadelphia International Airport",
    iataCode: "PHL",
    country: "United States",
  },
  {
    sourceId: "iad",
    name: "Washington Dulles International Airport",
    iataCode: "IAD",
    country: "United States",
  },
  {
    sourceId: "ool",
    name: "Gold Coast Airport",
    iataCode: "OOL",
    country: "Australia",
  },
  {
    sourceId: "per",
    name: "Perth Airport",
    iataCode: "PER",
    country: "Australia",
  },
  {
    sourceId: "svo",
    name: "Sheremetyevo International Airport",
    iataCode: "SVO",
    country: "Russia",
  },
  {
    sourceId: "dme",
    name: "Domodedovo Airport",
    iataCode: "DME",
    country: "Russia",
  },
  {
    sourceId: "svx",
    name: "Koltsovo Airport",
    iataCode: "SVX",
    country: "Russia",
  },
  {
    sourceId: "vvo",
    name: "Vladivostok International Airport",
    iataCode: "VVO",
    country: "Russia",
  },
  {
    sourceId: "tmp",
    name: "Tampere-Pirkkala (small)",
    iataCode: "TMP",
    country: "Finland",
  },
  {
    sourceId: "bdo",
    name: "Bandung Husein Sastranegara International Airport",
    iataCode: "BDO",
    country: "Indonesia",
  },
  {
    sourceId: "cgk",
    name: "Soekarno–Hatta International Airport",
    iataCode: "CGK",
    country: "Indonesia",
  },
  {
    sourceId: "dps",
    name: "Ngurah Rai International Airport",
    iataCode: "DPS",
    country: "Indonesia",
  },
  {
    sourceId: "ifn",
    name: "Isfahan International Airport",
    iataCode: "IFN",
    country: "Iran",
  },
  {
    sourceId: "mct",
    name: "Muscat International Airport",
    iataCode: "MCT",
    country: "Oman",
  },
  {
    sourceId: "saw",
    name: "Sabiha Gökçen International Airport",
    iataCode: "SAW",
    country: "Turkey",
  },
  {
    sourceId: "mle",
    name: "Velana International Airport (Malé)",
    iataCode: "MLE",
    country: "Maldives",
  },
  {
    sourceId: "mdf",
    name: "Male (secondary)",
    iataCode: "MDF",
    country: "Maldives",
  },
  {
    sourceId: "vns",
    name: "Varanasi International Airport",
    iataCode: "VNS",
    country: "India",
  },
  {
    sourceId: "trv",
    name: "Trivandrum International Airport",
    iataCode: "TRV",
    country: "India",
  },
  {
    sourceId: "ccu",
    name: "Netaji Subhas Chandra Bose International Airport",
    iataCode: "CCU",
    country: "India",
  },
  {
    sourceId: "blr",
    name: "Kempegowda International Airport",
    iataCode: "BLR",
    country: "India",
  },
  {
    sourceId: "pnq",
    name: "Pune Airport",
    iataCode: "PNQ",
    country: "India",
  },
  {
    sourceId: "cju",
    name: "Jeju International Airport",
    iataCode: "CJU",
    country: "South Korea",
  },
  {
    sourceId: "gmp",
    name: "Gimpo International Airport",
    iataCode: "GMP",
    country: "South Korea",
  },
  {
    sourceId: "icn",
    name: "Incheon International Airport",
    iataCode: "ICN",
    country: "South Korea",
  },
  {
    sourceId: "oks",
    name: "Oksibil (small)",
    iataCode: "OKS",
    country: "Indonesia",
  },
  {
    sourceId: "ber",
    name: "Berlin Schönefeld (now BER)",
    iataCode: "BER",
    country: "Germany",
  },
  {
    sourceId: "nce",
    name: "Nice Côte d'Azur Airport",
    iataCode: "NCE",
    country: "France",
  },
  {
    sourceId: "tfs",
    name: "Tenerife South Airport",
    iataCode: "TFS",
    country: "Spain",
  },
  {
    sourceId: "las",
    name: "McCarran International Airport",
    iataCode: "LAS",
    country: "United States",
  },
  {
    sourceId: "phx",
    name: "Phoenix Sky Harbor International Airport",
    iataCode: "PHX",
    country: "United States",
  },
  {
    sourceId: "msy",
    name: "Louis Armstrong New Orleans International Airport",
    iataCode: "MSY",
    country: "United States",
  },
  {
    sourceId: "sdf",
    name: "Louisville Muhammad Ali International Airport",
    iataCode: "SDF",
    country: "United States",
  },
  {
    sourceId: "okc",
    name: "Will Rogers World Airport",
    iataCode: "OKC",
    country: "United States",
  },
  {
    sourceId: "stl",
    name: "St. Louis Lambert International Airport",
    iataCode: "STL",
    country: "United States",
  },
  {
    sourceId: "bgi",
    name: "Grantley Adams International Airport",
    iataCode: "BGI",
    country: "Barbados",
  },
  {
    sourceId: "nas",
    name: "Lynden Pindling International Airport",
    iataCode: "NAS",
    country: "Bahamas",
  },
  {
    sourceId: "gyd",
    name: "Heydar Aliyev International Airport",
    iataCode: "GYD",
    country: "Azerbaijan",
  },
  {
    sourceId: "tbs",
    name: "Tbilisi International Airport",
    iataCode: "TBS",
    country: "Georgia",
  },
  {
    sourceId: "vra",
    name: "Varadero Juan Gualberto Gómez International Airport",
    iataCode: "VRA",
    country: "Cuba",
  },
  {
    sourceId: "sju",
    name: "Luis Muñoz Marín International Airport",
    iataCode: "SJU",
    country: "Puerto Rico",
  },
  {
    sourceId: "ltn",
    name: "London Luton Airport",
    iataCode: "LTN",
    country: "United Kingdom",
  },
  {
    sourceId: "stn",
    name: "London Stansted Airport",
    iataCode: "STN",
    country: "United Kingdom",
  },
  {
    sourceId: "cai",
    name: "Cairo International Airport",
    iataCode: "CAI",
    country: "Egypt",
  },
  {
    sourceId: "cmn",
    name: "Mohammed V International Airport",
    iataCode: "CMN",
    country: "Morocco",
  },
  {
    sourceId: "bak",
    name: "Baku (alternate)",
    iataCode: "BAK",
    country: "Azerbaijan",
  },
  {
    sourceId: "tas",
    name: "Tashkent International Airport",
    iataCode: "TAS",
    country: "Uzbekistan",
  },
  {
    sourceId: "fru",
    name: "Manas International Airport",
    iataCode: "FRU",
    country: "Kyrgyzstan",
  },
  {
    sourceId: "nbo",
    name: "Jomo Kenyatta International Airport",
    iataCode: "NBO",
    country: "Kenya",
  },
  {
    sourceId: "mnl",
    name: "Ninoy Aquino International Airport",
    iataCode: "MNL",
    country: "Philippines",
  },
  {
    sourceId: "ceb",
    name: "Mactan–Cebu International Airport",
    iataCode: "CEB",
    country: "Philippines",
  },
  {
    sourceId: "cjs",
    name: "Ciudad Juárez International Airport",
    iataCode: "CJS",
    country: "Mexico",
  },
  {
    sourceId: "mex",
    name: "Mexico City International Airport",
    iataCode: "MEX",
    country: "Mexico",
  },
  {
    sourceId: "gdl",
    name: "Guadalajara International Airport",
    iataCode: "GDL",
    country: "Mexico",
  },
];

const normalizeText = (value = "") =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim();

const normalizeIataCode = (value = "") => normalizeText(value).toUpperCase();

const isValidIataCode = (iataCode = "") =>
  /^[A-Z]{3}$/.test(normalizeIataCode(iataCode));

const seenIataCodes = new Set();

const travelAirports = SOURCE_TRAVEL_AIRPORTS.filter((airport) => {
  const iataCode = normalizeIataCode(airport.iataCode);

  if (!isValidIataCode(iataCode)) {
    return false;
  }

  if (seenIataCodes.has(iataCode)) {
    return false;
  }

  seenIataCodes.add(iataCode);

  return true;
}).map((airport) => ({
  name: normalizeText(airport.name),
  iataCode: normalizeIataCode(airport.iataCode),
  icaoCode: "",
  city: "",
  country: normalizeText(airport.country),
  countryCode: "",
  aliases: [],
  notes: "",
  isActive: true,
  isDefault: true,
}));

module.exports = travelAirports;
