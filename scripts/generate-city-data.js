/**
 * City Data Generation Script
 * 
 * Fetches ~3,200 US cities (pop > 10K) from the US Census Bureau API,
 * enriches with cost-of-living, healthcare systems, and mental health
 * shortage data, then writes lib/pseo/city-data/cities.ts.
 * 
 * Usage: node scripts/generate-city-data.js
 */
const fs = require('fs');
const path = require('path');

// ─── State FIPS Codes ──────────────────────────────────────────────────────────
const FIPS_TO_STATE = {
  '01': { name: 'Alabama', code: 'AL' },
  '02': { name: 'Alaska', code: 'AK' },
  '04': { name: 'Arizona', code: 'AZ' },
  '05': { name: 'Arkansas', code: 'AR' },
  '06': { name: 'California', code: 'CA' },
  '08': { name: 'Colorado', code: 'CO' },
  '09': { name: 'Connecticut', code: 'CT' },
  '10': { name: 'Delaware', code: 'DE' },
  '11': { name: 'District of Columbia', code: 'DC' },
  '12': { name: 'Florida', code: 'FL' },
  '13': { name: 'Georgia', code: 'GA' },
  '15': { name: 'Hawaii', code: 'HI' },
  '16': { name: 'Idaho', code: 'ID' },
  '17': { name: 'Illinois', code: 'IL' },
  '18': { name: 'Indiana', code: 'IN' },
  '19': { name: 'Iowa', code: 'IA' },
  '20': { name: 'Kansas', code: 'KS' },
  '21': { name: 'Kentucky', code: 'KY' },
  '22': { name: 'Louisiana', code: 'LA' },
  '23': { name: 'Maine', code: 'ME' },
  '24': { name: 'Maryland', code: 'MD' },
  '25': { name: 'Massachusetts', code: 'MA' },
  '26': { name: 'Michigan', code: 'MI' },
  '27': { name: 'Minnesota', code: 'MN' },
  '28': { name: 'Mississippi', code: 'MS' },
  '29': { name: 'Missouri', code: 'MO' },
  '30': { name: 'Montana', code: 'MT' },
  '31': { name: 'Nebraska', code: 'NE' },
  '32': { name: 'Nevada', code: 'NV' },
  '33': { name: 'New Hampshire', code: 'NH' },
  '34': { name: 'New Jersey', code: 'NJ' },
  '35': { name: 'New Mexico', code: 'NM' },
  '36': { name: 'New York', code: 'NY' },
  '37': { name: 'North Carolina', code: 'NC' },
  '38': { name: 'North Dakota', code: 'ND' },
  '39': { name: 'Ohio', code: 'OH' },
  '40': { name: 'Oklahoma', code: 'OK' },
  '41': { name: 'Oregon', code: 'OR' },
  '42': { name: 'Pennsylvania', code: 'PA' },
  '44': { name: 'Rhode Island', code: 'RI' },
  '45': { name: 'South Carolina', code: 'SC' },
  '46': { name: 'South Dakota', code: 'SD' },
  '47': { name: 'Tennessee', code: 'TN' },
  '48': { name: 'Texas', code: 'TX' },
  '49': { name: 'Utah', code: 'UT' },
  '50': { name: 'Vermont', code: 'VT' },
  '51': { name: 'Virginia', code: 'VA' },
  '53': { name: 'Washington', code: 'WA' },
  '54': { name: 'West Virginia', code: 'WV' },
  '55': { name: 'Wisconsin', code: 'WI' },
  '56': { name: 'Wyoming', code: 'WY' },
};

// ─── Cost of Living by State (BLS data, national avg = 100) ────────────────────
const STATE_COL = {
  'AL': 89, 'AK': 125, 'AZ': 103, 'AR': 87, 'CA': 142, 'CO': 105,
  'CT': 113, 'DE': 103, 'DC': 148, 'FL': 103, 'GA': 93, 'HI': 192,
  'ID': 97, 'IL': 96, 'IN': 90, 'IA': 90, 'KS': 89, 'KY': 87,
  'LA': 91, 'ME': 99, 'MD': 113, 'MA': 131, 'MI': 91, 'MN': 98,
  'MS': 84, 'MO': 89, 'MT': 96, 'NE': 92, 'NV': 104, 'NH': 106,
  'NJ': 120, 'NM': 93, 'NY': 127, 'NC': 96, 'ND': 94, 'OH': 91,
  'OK': 87, 'OR': 113, 'PA': 97, 'RI': 107, 'SC': 95, 'SD': 93,
  'TN': 90, 'TX': 92, 'UT': 101, 'VT': 105, 'VA': 104, 'WA': 115,
  'WV': 84, 'WI': 93, 'WY': 93,
};

// City-level COL adjustments (offsets from state baseline for expensive/cheap cities)
const CITY_COL_ADJUSTMENTS = {
  'new-york-ny': 45, 'san-francisco-ca': 40, 'san-jose-ca': 35,
  'los-angeles-ca': 20, 'seattle-wa': 25, 'boston-ma': 20,
  'washington-dc': 15, 'miami-fl': 18, 'chicago-il': 12,
  'denver-co': 12, 'austin-tx': 15, 'portland-or': 12,
  'san-diego-ca': 15, 'honolulu-hi': 10, 'stamford-ct': 15,
  'brooklyn-ny': 42, 'oakland-ca': 30, 'santa-barbara-ca': 30,
  'boulder-co': 18, 'alexandria-va': 15, 'hoboken-nj': 25,
  'jersey-city-nj': 20, 'cambridge-ma': 25, 'palo-alto-ca': 45,
  'nashville-tn': 10, 'dallas-tx': 8, 'houston-tx': 5,
  'atlanta-ga': 10, 'phoenix-az': 5, 'detroit-mi': -8,
  'cleveland-oh': -5, 'memphis-tn': -5, 'el-paso-tx': -8,
  'toledo-oh': -8, 'buffalo-ny': -10, 'syracuse-ny': -12,
  'rochester-ny': -10, 'akron-oh': -8, 'flint-mi': -12,
  'dayton-oh': -8, 'birmingham-al': -3, 'jackson-ms': -5,
  'lubbock-tx': -8, 'mcallen-tx': -12, 'brownsville-tx': -12,
  'shreveport-la': -5, 'mobile-al': -5, 'wichita-ks': -5,
  'tulsa-ok': -5, 'omaha-ne': 3, 'minneapolis-mn': 8,
  'raleigh-nc': 8, 'charlotte-nc': 5, 'salt-lake-city-ut': 5,
  'pittsburgh-pa': -2, 'philadelphia-pa': 8, 'tampa-fl': 5,
  'orlando-fl': 5, 'las-vegas-nv': 5, 'sacramento-ca': 8,
  'riverside-ca': 0, 'fresno-ca': -5, 'bakersfield-ca': -5,
};

// ─── Mental Health HPSA States (higher shortage rates) ─────────────────────────
// States where > 50% of population is in MH HPSA designation
const HIGH_SHORTAGE_STATES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'ID', 'KS', 'KY', 'LA', 'ME', 'MS',
  'MO', 'MT', 'NE', 'NV', 'NM', 'ND', 'OK', 'SC', 'SD', 'TN',
  'TX', 'UT', 'WV', 'WY',
]);
// States with moderate shortage
const MODERATE_SHORTAGE_STATES = new Set([
  'CO', 'FL', 'GA', 'HI', 'IN', 'IA', 'MI', 'MN', 'NC', 'OH',
  'OR', 'PA', 'VA', 'WA', 'WI',
]);

// ─── Healthcare Systems by Metro ────────────────────────────────────────────────
const METRO_HEALTHCARE = {
  'New York': ['NewYork-Presbyterian', 'Mount Sinai Health System', 'NYU Langone', 'Northwell Health', 'Montefiore'],
  'Los Angeles': ['Cedars-Sinai', 'UCLA Health', 'Kaiser Permanente', 'Providence', 'Dignity Health'],
  'Chicago': ['Northwestern Medicine', 'Rush University Medical Center', 'Advocate Aurora', 'University of Chicago Medicine'],
  'Houston': ['Houston Methodist', 'Memorial Hermann', 'MD Anderson', 'Baylor St. Luke\'s', 'HCA Houston Healthcare'],
  'Phoenix': ['Banner Health', 'HonorHealth', 'Dignity Health', 'Mayo Clinic Arizona', 'Valleywise Health'],
  'Philadelphia': ['Penn Medicine', 'Jefferson Health', 'Temple Health', 'Main Line Health'],
  'San Antonio': ['University Health', 'Methodist Healthcare', 'Baptist Health System', 'CHRISTUS Santa Rosa'],
  'San Diego': ['Scripps Health', 'Sharp HealthCare', 'UC San Diego Health', 'Kaiser Permanente'],
  'Dallas': ['UT Southwestern', 'Baylor Scott & White', 'Parkland Health', 'Texas Health Resources', 'Medical City Healthcare'],
  'San Jose': ['Kaiser Permanente', 'Stanford Health Care', 'El Camino Health', 'Santa Clara Valley Medical Center'],
  'Austin': ['Ascension Seton', 'St. David\'s HealthCare', 'Baylor Scott & White', 'CommUnityCare'],
  'Jacksonville': ['Mayo Clinic Florida', 'Baptist Health', 'UF Health Jacksonville', 'Ascension St. Vincent\'s'],
  'Fort Worth': ['JPS Health Network', 'Baylor Scott & White', 'Texas Health Resources', 'Medical City'],
  'Columbus': ['Ohio State Wexner Medical Center', 'OhioHealth', 'Mount Carmel Health', 'Nationwide Children\'s'],
  'Charlotte': ['Atrium Health', 'Novant Health', 'CaroMont Health'],
  'Indianapolis': ['IU Health', 'Community Health Network', 'Ascension St. Vincent', 'Eskenazi Health'],
  'San Francisco': ['UCSF Health', 'Kaiser Permanente', 'Sutter Health', 'CommonSpirit Health', 'Dignity Health'],
  'Seattle': ['UW Medicine', 'Swedish Health', 'Providence', 'Kaiser Permanente', 'MultiCare'],
  'Denver': ['UCHealth', 'SCL Health', 'Denver Health', 'Kaiser Permanente', 'HealthONE'],
  'Washington': ['MedStar Health', 'Inova', 'Johns Hopkins', 'Kaiser Permanente', 'George Washington University Hospital'],
  'Nashville': ['Vanderbilt University Medical Center', 'HCA Healthcare', 'Ascension Saint Thomas', 'TriStar Health'],
  'Oklahoma City': ['INTEGRIS Health', 'Mercy', 'SSM Health', 'OU Health'],
  'El Paso': ['University Medical Center', 'The Hospitals of Providence', 'Las Palmas Del Sol Healthcare'],
  'Boston': ['Mass General Brigham', 'Beth Israel Lahey', 'Tufts Medical Center', 'Boston Medical Center', 'Dana-Farber'],
  'Portland': ['OHSU', 'Providence', 'Legacy Health', 'Kaiser Permanente', 'PeaceHealth'],
  'Las Vegas': ['University Medical Center', 'Sunrise Health', 'Valley Health System', 'Dignity Health'],
  'Memphis': ['Methodist Le Bonheur', 'Baptist Memorial', 'St. Jude Children\'s', 'Regional One Health'],
  'Louisville': ['Norton Healthcare', 'Baptist Health', 'UofL Health', 'Kindred Healthcare'],
  'Baltimore': ['Johns Hopkins', 'University of Maryland Medical System', 'MedStar', 'LifeBridge Health'],
  'Milwaukee': ['Aurora Health Care', 'Froedtert & MCW', 'Ascension Wisconsin', 'Children\'s Wisconsin'],
  'Albuquerque': ['University of New Mexico Health', 'Presbyterian Healthcare', 'Lovelace Health System'],
  'Tucson': ['Banner University Medical Center', 'Tucson Medical Center', 'Northwest Medical Center'],
  'Fresno': ['Community Medical Centers', 'Saint Agnes Medical Center', 'Kaiser Permanente'],
  'Sacramento': ['UC Davis Health', 'Sutter Health', 'Dignity Health', 'Kaiser Permanente'],
  'Kansas City': ['Saint Luke\'s Health System', 'University of Kansas Health System', 'HCA Midwest', 'Research Medical Center'],
  'Atlanta': ['Emory Healthcare', 'Grady Health System', 'Piedmont Healthcare', 'WellStar Health System', 'Northside Hospital'],
  'Miami': ['Jackson Health System', 'Baptist Health South Florida', 'Cleveland Clinic Florida', 'University of Miami Health'],
  'Raleigh': ['WakeMed', 'UNC Health', 'Duke Health'],
  'Minneapolis': ['Mayo Clinic', 'Allina Health', 'Fairview Health', 'HealthPartners', 'Hennepin Healthcare'],
  'Tampa': ['Tampa General Hospital', 'BayCare Health', 'AdventHealth', 'Moffitt Cancer Center'],
  'Cleveland': ['Cleveland Clinic', 'University Hospitals', 'MetroHealth'],
  'Pittsburgh': ['UPMC', 'Allegheny Health Network', 'Highmark Health'],
  'Detroit': ['Henry Ford Health', 'Beaumont Health', 'Ascension', 'Detroit Medical Center'],
  'St. Louis': ['BJC HealthCare', 'SSM Health', 'Mercy', 'Ascension'],
  'Salt Lake City': ['Intermountain Healthcare', 'University of Utah Health', 'MountainStar Healthcare'],
  'Orlando': ['AdventHealth', 'Orlando Health', 'Nemours Children\'s'],
  'Cincinnati': ['TriHealth', 'UC Health', 'Christ Hospital', 'Mercy Health'],
  'Richmond': ['VCU Health', 'Bon Secours Mercy', 'HCA Virginia'],
  'Hartford': ['Hartford HealthCare', 'Trinity Health Of New England', 'UConn Health'],
  'New Orleans': ['Ochsner Health', 'LCMC Health', 'Tulane Medical Center'],
  'Buffalo': ['Kaleida Health', 'Catholic Health', 'ECMC'],
  'Birmingham': ['UAB Health System', 'Ascension St. Vincent\'s', 'Brookwood Baptist'],
  'Providence': ['Lifespan', 'Care New England', 'Brown University Health'],
  'Honolulu': ['Hawaii Pacific Health', 'The Queen\'s Health Systems', 'Kaiser Permanente'],
};

// ─── Metro area mappings ────────────────────────────────────────────────────────
// Map city names (lowercase) → metro area name
const CITY_TO_METRO = {};
function addMetroCities(metroName, cityNames) {
  for (const city of cityNames) {
    CITY_TO_METRO[city.toLowerCase()] = metroName;
  }
}
addMetroCities('New York-Newark-Jersey City', ['New York', 'Newark', 'Jersey City', 'Yonkers', 'Paterson', 'Elizabeth', 'Stamford', 'Bridgeport', 'New Rochelle', 'White Plains', 'Hoboken']);
addMetroCities('Los Angeles-Long Beach-Anaheim', ['Los Angeles', 'Long Beach', 'Anaheim', 'Santa Ana', 'Irvine', 'Glendale', 'Huntington Beach', 'Santa Clarita', 'Garden Grove', 'Torrance', 'Pasadena', 'Pomona', 'Burbank']);
addMetroCities('Chicago-Naperville-Elgin', ['Chicago', 'Naperville', 'Elgin', 'Aurora', 'Joliet', 'Cicero', 'Evanston', 'Schaumburg', 'Bolingbrook', 'Waukegan', 'Arlington Heights']);
addMetroCities('Dallas-Fort Worth-Arlington', ['Dallas', 'Fort Worth', 'Arlington', 'Plano', 'Irving', 'Garland', 'Frisco', 'McKinney', 'Grand Prairie', 'Denton', 'Mesquite', 'Carrollton', 'Richardson']);
addMetroCities('Houston-The Woodlands-Sugar Land', ['Houston', 'Pasadena', 'Sugar Land', 'Pearland', 'League City', 'Baytown', 'Missouri City', 'Conroe']);
addMetroCities('Washington-Arlington-Alexandria', ['Washington', 'Arlington', 'Alexandria', 'Fairfax', 'Rockville', 'Reston', 'Bethesda', 'Silver Spring', 'Frederick']);
addMetroCities('Philadelphia-Camden-Wilmington', ['Philadelphia', 'Camden', 'Wilmington', 'Chester', 'Norristown']);
addMetroCities('Miami-Fort Lauderdale-Pompano Beach', ['Miami', 'Fort Lauderdale', 'Pompano Beach', 'Hollywood', 'Hialeah', 'Coral Springs', 'Miramar', 'Pembroke Pines', 'Davie', 'Boca Raton', 'Deerfield Beach']);
addMetroCities('Atlanta-Sandy Springs-Alpharetta', ['Atlanta', 'Sandy Springs', 'Alpharetta', 'Roswell', 'Marietta', 'Smyrna', 'Johns Creek', 'Dunwoody']);
addMetroCities('Boston-Cambridge-Newton', ['Boston', 'Cambridge', 'Newton', 'Quincy', 'Somerville', 'Waltham', 'Brookline', 'Brockton', 'Lowell', 'Lawrence', 'Lynn']);
addMetroCities('San Francisco-Oakland-Berkeley', ['San Francisco', 'Oakland', 'Berkeley', 'Fremont', 'Hayward', 'San Mateo', 'Daly City', 'Redwood City', 'South San Francisco']);
addMetroCities('Phoenix-Mesa-Chandler', ['Phoenix', 'Mesa', 'Chandler', 'Scottsdale', 'Gilbert', 'Tempe', 'Peoria', 'Surprise', 'Goodyear', 'Glendale', 'Avondale', 'Buckeye']);
addMetroCities('Riverside-San Bernardino-Ontario', ['Riverside', 'San Bernardino', 'Ontario', 'Fontana', 'Rancho Cucamonga', 'Moreno Valley', 'Corona', 'Murrieta', 'Temecula', 'Victorville']);
addMetroCities('Detroit-Warren-Dearborn', ['Detroit', 'Warren', 'Dearborn', 'Livonia', 'Troy', 'Sterling Heights', 'Westland', 'Southfield', 'Royal Oak', 'Pontiac', 'Farmington Hills']);
addMetroCities('Seattle-Tacoma-Bellevue', ['Seattle', 'Tacoma', 'Bellevue', 'Kent', 'Renton', 'Federal Way', 'Everett', 'Auburn', 'Bothell', 'Kirkland', 'Redmond']);
addMetroCities('Minneapolis-Saint Paul-Bloomington', ['Minneapolis', 'Saint Paul', 'Bloomington', 'Plymouth', 'Brooklyn Park', 'Woodbury', 'Maple Grove', 'Lakeville', 'Eagan', 'Eden Prairie']);
addMetroCities('San Diego-Chula Vista-Carlsbad', ['San Diego', 'Chula Vista', 'Carlsbad', 'Escondido', 'Oceanside', 'Vista', 'San Marcos', 'El Cajon', 'Encinitas', 'National City']);
addMetroCities('Tampa-St. Petersburg-Clearwater', ['Tampa', 'St. Petersburg', 'Clearwater', 'Brandon', 'Largo', 'Plant City']);
addMetroCities('Denver-Aurora-Lakewood', ['Denver', 'Aurora', 'Lakewood', 'Centennial', 'Thornton', 'Arvada', 'Westminster', 'Broomfield', 'Longmont', 'Boulder', 'Castle Rock', 'Parker', 'Littleton']);
addMetroCities('St. Louis', ['St. Louis', 'O\'Fallon', 'St. Charles', 'St. Peters', 'Chesterfield', 'Florissant']);
addMetroCities('Baltimore-Columbia-Towson', ['Baltimore', 'Columbia', 'Towson', 'Ellicott City', 'Bel Air']);
addMetroCities('Orlando-Kissimmee-Sanford', ['Orlando', 'Kissimmee', 'Sanford', 'Deltona', 'Ocoee', 'Apopka']);
addMetroCities('Charlotte-Concord-Gastonia', ['Charlotte', 'Concord', 'Gastonia', 'Huntersville', 'Mooresville']);
addMetroCities('San Antonio-New Braunfels', ['San Antonio', 'New Braunfels']);
addMetroCities('Portland-Vancouver-Hillsboro', ['Portland', 'Vancouver', 'Hillsboro', 'Beaverton', 'Gresham', 'Tigard', 'Lake Oswego']);
addMetroCities('Sacramento-Roseville-Folsom', ['Sacramento', 'Roseville', 'Folsom', 'Elk Grove', 'Rancho Cordova', 'Citrus Heights', 'Davis']);
addMetroCities('Pittsburgh', ['Pittsburgh', 'McKeesport']);
addMetroCities('Las Vegas-Henderson-Paradise', ['Las Vegas', 'Henderson', 'North Las Vegas', 'Paradise']);
addMetroCities('Austin-Round Rock-Georgetown', ['Austin', 'Round Rock', 'Georgetown', 'Cedar Park', 'Pflugerville', 'San Marcos', 'Kyle']);
addMetroCities('Cincinnati', ['Cincinnati', 'Covington', 'Newport']);
addMetroCities('Kansas City', ['Kansas City', 'Overland Park', 'Olathe', 'Lee\'s Summit', 'Independence', 'Shawnee', 'Lenexa']);
addMetroCities('Columbus', ['Columbus', 'Dublin', 'Westerville', 'Grove City', 'Hilliard', 'Reynoldsburg']);
addMetroCities('Indianapolis-Carmel-Anderson', ['Indianapolis', 'Carmel', 'Anderson', 'Fishers', 'Noblesville', 'Greenwood', 'Lawrence']);
addMetroCities('Cleveland-Elyria', ['Cleveland', 'Elyria', 'Lakewood', 'Parma', 'Strongsville', 'Mentor']);
addMetroCities('Nashville-Davidson-Murfreesboro-Franklin', ['Nashville', 'Murfreesboro', 'Franklin', 'Hendersonville', 'Lebanon', 'Gallatin', 'Spring Hill', 'Smyrna']);
addMetroCities('Raleigh-Cary', ['Raleigh', 'Cary', 'Apex', 'Wake Forest', 'Holly Springs', 'Garner', 'Fuquay-Varina']);
addMetroCities('Salt Lake City', ['Salt Lake City', 'West Valley City', 'West Jordan', 'Sandy', 'Orem', 'Provo', 'Ogden', 'Layton', 'South Jordan', 'Lehi', 'Taylorsville']);
addMetroCities('Milwaukee-Waukesha', ['Milwaukee', 'Waukesha', 'West Allis', 'Wauwatosa', 'Brookfield', 'New Berlin']);
addMetroCities('Hartford-East Hartford-Middletown', ['Hartford', 'New Britain', 'Bristol', 'Meriden', 'Middletown', 'Manchester', 'West Hartford']);
addMetroCities('Jacksonville', ['Jacksonville', 'St. Augustine']);
addMetroCities('Memphis', ['Memphis', 'Bartlett', 'Germantown', 'Collierville']);
addMetroCities('Louisville-Jefferson County', ['Louisville', 'Jeffersontown', 'Shively']);
addMetroCities('Richmond', ['Richmond', 'Henrico', 'Chester']);
addMetroCities('New Orleans-Metairie', ['New Orleans', 'Metairie', 'Kenner', 'Slidell']);
addMetroCities('Oklahoma City', ['Oklahoma City', 'Norman', 'Edmond', 'Moore', 'Midwest City', 'Yukon', 'Mustang']);
addMetroCities('Tucson', ['Tucson', 'Marana', 'Oro Valley']);
addMetroCities('Birmingham-Hoover', ['Birmingham', 'Hoover', 'Vestavia Hills', 'Homewood', 'Alabaster']);
addMetroCities('Buffalo-Cheektowaga', ['Buffalo', 'Cheektowaga', 'Tonawanda']);
addMetroCities('Honolulu', ['Honolulu', 'Pearl City', 'Kailua']);
addMetroCities('Providence-Warwick', ['Providence', 'Warwick', 'Cranston', 'Pawtucket', 'East Providence', 'Woonsocket']);
addMetroCities('Albuquerque', ['Albuquerque', 'Rio Rancho']);

// Median income by state (simplified, Census ACS data)
const STATE_MEDIAN_INCOME = {
  'AL': 56956, 'AK': 77790, 'AZ': 65913, 'AR': 52528, 'CA': 84097,
  'CO': 82254, 'CT': 83771, 'DE': 72442, 'DC': 90842, 'FL': 63062,
  'GA': 65030, 'HI': 84857, 'ID': 63377, 'IL': 72205, 'IN': 61944,
  'IA': 65573, 'KS': 64521, 'KY': 55629, 'LA': 52295, 'ME': 64767,
  'MD': 90203, 'MA': 89645, 'MI': 63498, 'MN': 77706, 'MS': 48610,
  'MO': 61043, 'MT': 60560, 'NE': 67045, 'NV': 65686, 'NH': 83449,
  'NJ': 89296, 'NM': 53992, 'NY': 74314, 'NC': 60516, 'ND': 68131,
  'OH': 59855, 'OK': 55826, 'OR': 71562, 'PA': 67587, 'RI': 71169,
  'SC': 59318, 'SD': 63920, 'TN': 59695, 'TX': 67321, 'UT': 79449,
  'VT': 65825, 'VA': 80615, 'WA': 82228, 'WV': 48037, 'WI': 67125,
  'WY': 68002,
};

// ─── Coordinates for major cities ───────────────────────────────────────────────
// For smaller cities, coordinates will be estimated from state centroids
const CITY_COORDS = {
  'new york': { lat: 40.7128, lng: -74.0060 },
  'los angeles': { lat: 34.0522, lng: -118.2437 },
  'chicago': { lat: 41.8781, lng: -87.6298 },
  'houston': { lat: 29.7604, lng: -95.3698 },
  'phoenix': { lat: 33.4484, lng: -112.0740 },
  'philadelphia': { lat: 39.9526, lng: -75.1652 },
  'san antonio': { lat: 29.4241, lng: -98.4936 },
  'san diego': { lat: 32.7157, lng: -117.1611 },
  'dallas': { lat: 32.7767, lng: -96.7970 },
  'san jose': { lat: 37.3382, lng: -121.8863 },
  'austin': { lat: 30.2672, lng: -97.7431 },
  'jacksonville': { lat: 30.3322, lng: -81.6557 },
  'fort worth': { lat: 32.7555, lng: -97.3308 },
  'columbus': { lat: 39.9612, lng: -82.9988 },
  'charlotte': { lat: 35.2271, lng: -80.8431 },
  'indianapolis': { lat: 39.7684, lng: -86.1581 },
  'san francisco': { lat: 37.7749, lng: -122.4194 },
  'seattle': { lat: 47.6062, lng: -122.3321 },
  'denver': { lat: 39.7392, lng: -104.9903 },
  'washington': { lat: 38.9072, lng: -77.0369 },
  'nashville': { lat: 36.1627, lng: -86.7816 },
  'oklahoma city': { lat: 35.4676, lng: -97.5164 },
  'el paso': { lat: 31.7619, lng: -106.4850 },
  'boston': { lat: 42.3601, lng: -71.0589 },
  'portland': { lat: 45.5152, lng: -122.6784 },
  'las vegas': { lat: 36.1699, lng: -115.1398 },
  'memphis': { lat: 35.1495, lng: -90.0490 },
  'louisville': { lat: 38.2527, lng: -85.7585 },
  'baltimore': { lat: 39.2904, lng: -76.6122 },
  'milwaukee': { lat: 43.0389, lng: -87.9065 },
  'albuquerque': { lat: 35.0844, lng: -106.6504 },
  'tucson': { lat: 32.2226, lng: -110.9747 },
  'fresno': { lat: 36.7378, lng: -119.7871 },
  'sacramento': { lat: 38.5816, lng: -121.4944 },
  'mesa': { lat: 33.4152, lng: -111.8315 },
  'kansas city': { lat: 39.0997, lng: -94.5786 },
  'atlanta': { lat: 33.7490, lng: -84.3880 },
  'omaha': { lat: 41.2565, lng: -95.9345 },
  'colorado springs': { lat: 38.8339, lng: -104.8214 },
  'raleigh': { lat: 35.7796, lng: -78.6382 },
  'long beach': { lat: 33.7701, lng: -118.1937 },
  'virginia beach': { lat: 36.8529, lng: -75.9780 },
  'miami': { lat: 25.7617, lng: -80.1918 },
  'oakland': { lat: 37.8044, lng: -122.2712 },
  'minneapolis': { lat: 44.9778, lng: -93.2650 },
  'tulsa': { lat: 36.1540, lng: -95.9928 },
  'tampa': { lat: 27.9506, lng: -82.4572 },
  'new orleans': { lat: 29.9511, lng: -90.0715 },
  'cleveland': { lat: 41.4993, lng: -81.6944 },
  'pittsburgh': { lat: 40.4406, lng: -79.9959 },
  'detroit': { lat: 42.3314, lng: -83.0458 },
  'st. louis': { lat: 38.6270, lng: -90.1994 },
  'salt lake city': { lat: 40.7608, lng: -111.8910 },
  'orlando': { lat: 28.5383, lng: -81.3792 },
  'cincinnati': { lat: 39.1031, lng: -84.5120 },
  'richmond': { lat: 37.5407, lng: -77.4360 },
  'honolulu': { lat: 21.3069, lng: -157.8583 },
  'buffalo': { lat: 42.8864, lng: -78.8784 },
  'birmingham': { lat: 33.5186, lng: -86.8104 },
  'providence': { lat: 41.8240, lng: -71.4128 },
};

// State centroids for cities without explicit coordinates
const STATE_CENTROIDS = {
  'AL': { lat: 32.806671, lng: -86.791130 }, 'AK': { lat: 61.370716, lng: -152.404419 },
  'AZ': { lat: 33.729759, lng: -111.431221 }, 'AR': { lat: 34.969704, lng: -92.373123 },
  'CA': { lat: 36.116203, lng: -119.681564 }, 'CO': { lat: 39.059811, lng: -105.311104 },
  'CT': { lat: 41.597782, lng: -72.755371 }, 'DE': { lat: 39.318523, lng: -75.507141 },
  'DC': { lat: 38.897438, lng: -77.026817 }, 'FL': { lat: 27.766279, lng: -81.686783 },
  'GA': { lat: 33.040619, lng: -83.643074 }, 'HI': { lat: 21.094318, lng: -157.498337 },
  'ID': { lat: 44.240459, lng: -114.478828 }, 'IL': { lat: 40.349457, lng: -88.986137 },
  'IN': { lat: 39.849426, lng: -86.258278 }, 'IA': { lat: 42.011539, lng: -93.210526 },
  'KS': { lat: 38.526600, lng: -96.726486 }, 'KY': { lat: 37.668140, lng: -84.670067 },
  'LA': { lat: 31.169546, lng: -91.867805 }, 'ME': { lat: 44.693947, lng: -69.381927 },
  'MD': { lat: 39.063946, lng: -76.802101 }, 'MA': { lat: 42.230171, lng: -71.530106 },
  'MI': { lat: 43.326618, lng: -84.536095 }, 'MN': { lat: 45.694454, lng: -93.900192 },
  'MS': { lat: 32.741646, lng: -89.678696 }, 'MO': { lat: 38.456085, lng: -92.288368 },
  'MT': { lat: 46.921925, lng: -110.454353 }, 'NE': { lat: 41.125370, lng: -98.268082 },
  'NV': { lat: 38.313515, lng: -117.055374 }, 'NH': { lat: 43.452492, lng: -71.563896 },
  'NJ': { lat: 40.298904, lng: -74.521011 }, 'NM': { lat: 34.840515, lng: -106.248482 },
  'NY': { lat: 42.165726, lng: -74.948051 }, 'NC': { lat: 35.630066, lng: -79.806419 },
  'ND': { lat: 47.528912, lng: -99.784012 }, 'OH': { lat: 40.388783, lng: -82.764915 },
  'OK': { lat: 35.565342, lng: -96.928917 }, 'OR': { lat: 44.572021, lng: -122.070938 },
  'PA': { lat: 40.590752, lng: -77.209755 }, 'RI': { lat: 41.680893, lng: -71.511780 },
  'SC': { lat: 33.856892, lng: -80.945007 }, 'SD': { lat: 44.299782, lng: -99.438828 },
  'TN': { lat: 35.747845, lng: -86.692345 }, 'TX': { lat: 31.054487, lng: -97.563461 },
  'UT': { lat: 40.150032, lng: -111.862434 }, 'VT': { lat: 44.045876, lng: -72.710686 },
  'VA': { lat: 37.769337, lng: -78.169968 }, 'WA': { lat: 47.400902, lng: -121.490494 },
  'WV': { lat: 38.491226, lng: -80.954456 }, 'WI': { lat: 44.268543, lng: -89.616508 },
  'WY': { lat: 42.755966, lng: -107.302490 },
};


// ─── Main Generation Function ──────────────────────────────────────────────────

function makeSlug(cityName, stateCode) {
  const cleanCity = cityName
    .toLowerCase()
    .replace(/\s+city$/i, '') // Remove trailing "city"
    .replace(/\s+town$/i, '') // Remove trailing "town"
    .replace(/\s+village$/i, '') // Remove trailing "village"
    .replace(/\s+borough$/i, '') // Remove trailing "borough"
    .replace(/\s+CDP$/i, '') // Remove Census Designated Place
    .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
  return `${cleanCity}-${stateCode.toLowerCase()}`;
}

function getCoords(cityName, stateCode) {
  const key = cityName.toLowerCase();
  if (CITY_COORDS[key]) return CITY_COORDS[key];
  // Slight offset from state centroid for uniqueness
  const centroid = STATE_CENTROIDS[stateCode] || { lat: 39.8, lng: -98.6 };
  // Hash the city name to get a consistent offset
  let hash = 0;
  for (let i = 0; i < cityName.length; i++) {
    hash = ((hash << 5) - hash) + cityName.charCodeAt(i);
    hash |= 0;
  }
  const latOffset = (hash % 100) / 200; // ±0.5 degrees
  const lngOffset = ((hash >> 8) % 100) / 200;
  return {
    lat: Number((centroid.lat + latOffset).toFixed(4)),
    lng: Number((centroid.lng + lngOffset).toFixed(4)),
  };
}

function getProviderRatio(stateCode, population) {
  if (HIGH_SHORTAGE_STATES.has(stateCode)) {
    return population > 100000 ? 'low' : 'critical';
  }
  if (MODERATE_SHORTAGE_STATES.has(stateCode)) {
    return population > 250000 ? 'moderate' : 'low';
  }
  return population > 500000 ? 'adequate' : 'moderate';
}

function getHealthcareSystems(cityName, stateName) {
  // Check if city is in a metro that has healthcare data
  const metroName = CITY_TO_METRO[cityName.toLowerCase()];
  if (metroName) {
    // Find matching healthcare key
    for (const [key, systems] of Object.entries(METRO_HEALTHCARE)) {
      if (metroName.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(cityName.toLowerCase())) {
        return systems;
      }
    }
  }
  // Direct city match
  for (const [key, systems] of Object.entries(METRO_HEALTHCARE)) {
    if (key.toLowerCase() === cityName.toLowerCase()) {
      return systems;
    }
  }
  return [];
}

async function fetchCensusData() {
  console.log('Fetching US Census data...');
  const url = 'https://api.census.gov/data/2020/dec/pl?get=NAME,P1_001N&for=place:*&in=state:*';
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Census API returned ${response.status}: ${response.statusText}`);
  }
  
  const data = await response.json();
  console.log(`Received ${data.length - 1} Census places`);
  
  // Skip header row
  const rows = data.slice(1);
  
  // Parse and filter
  const cities = [];
  const seenSlugs = new Set();
  
  for (const row of rows) {
    const fullName = row[0]; // "New York city, New York"
    const population = parseInt(row[1], 10);
    const stateFips = row[2];
    
    // Skip places with population < 10,000
    if (population < 10000) continue;
    
    // Get state info
    const stateInfo = FIPS_TO_STATE[stateFips];
    if (!stateInfo) continue;
    
    // Parse city name (remove state suffix and type designators)
    let cityName = fullName.split(',')[0].trim();
    // Remove common suffixes
    cityName = cityName
      .replace(/ city$/i, '')
      .replace(/ town$/i, '')
      .replace(/ village$/i, '')
      .replace(/ borough$/i, '')
      .replace(/ CDP$/i, '')
      .replace(/ municipality$/i, '')
      .replace(/ (city and borough)$/i, '')
      .replace(/ unified government.*$/i, '')
      .replace(/ metropolitan government.*$/i, '')
      .replace(/ consolidated government.*$/i, '')
      .trim();
    
    if (!cityName) continue;
    
    const slug = makeSlug(cityName, stateInfo.code);
    
    // Skip duplicates
    if (seenSlugs.has(slug)) continue;
    seenSlugs.add(slug);
    
    const coords = getCoords(cityName, stateInfo.code);
    const baseCOL = STATE_COL[stateInfo.code] || 100;
    const colAdj = CITY_COL_ADJUSTMENTS[slug] || 0;
    const metroName = CITY_TO_METRO[cityName.toLowerCase()] || null;
    const healthcareSystems = getHealthcareSystems(cityName, stateInfo.name);
    
    cities.push({
      name: cityName,
      state: stateInfo.name,
      stateCode: stateInfo.code,
      slug,
      population,
      costOfLivingIndex: baseCOL + colAdj,
      lat: coords.lat,
      lng: coords.lng,
      metroArea: metroName,
      mentalHealthShortage: HIGH_SHORTAGE_STATES.has(stateInfo.code) || 
        (MODERATE_SHORTAGE_STATES.has(stateInfo.code) && population < 100000),
      healthcareSystems,
      nearbyCities: [], // Will be computed after all cities are processed
      providerRatio: getProviderRatio(stateInfo.code, population),
      medianIncome: Math.round(
        (STATE_MEDIAN_INCOME[stateInfo.code] || 65000) * (1 + (colAdj / 200))
      ),
      stateRank: 0, // Will be computed after sorting
    });
  }
  
  console.log(`Filtered to ${cities.length} cities with population >= 10,000`);
  
  // Sort by population descending
  cities.sort((a, b) => b.population - a.population);
  
  // Compute state ranks
  const stateCounters = {};
  for (const city of cities) {
    stateCounters[city.stateCode] = (stateCounters[city.stateCode] || 0) + 1;
    city.stateRank = stateCounters[city.stateCode];
  }
  
  // Compute nearby cities (within ~1 degree lat/lng, max 6)
  console.log('Computing nearby cities...');
  for (let i = 0; i < cities.length; i++) {
    const city = cities[i];
    const candidates = [];
    
    for (let j = 0; j < cities.length; j++) {
      if (i === j) continue;
      const other = cities[j];
      const dLat = Math.abs(city.lat - other.lat);
      const dLng = Math.abs(city.lng - other.lng);
      if (dLat < 1.0 && dLng < 1.0) {
        const dist = Math.sqrt(dLat * dLat + dLng * dLng);
        candidates.push({ slug: other.slug, dist });
      }
    }
    
    candidates.sort((a, b) => a.dist - b.dist);
    city.nearbyCities = candidates.slice(0, 6).map(c => c.slug);
  }
  
  return cities;
}

function generateTypeScript(cities) {
  const lines = [];
  lines.push('// AUTO-GENERATED by scripts/generate-city-data.js');
  lines.push('// Do not edit manually. Re-run the script to update.');
  lines.push(`// Generated: ${new Date().toISOString()}`);
  lines.push(`// Total cities: ${cities.length}`);
  lines.push('');
  lines.push("import { CityData } from './types';");
  lines.push('');
  lines.push('export const CITIES: CityData[] = [');
  
  for (const city of cities) {
    lines.push('  {');
    lines.push(`    name: ${JSON.stringify(city.name)},`);
    lines.push(`    state: ${JSON.stringify(city.state)},`);
    lines.push(`    stateCode: ${JSON.stringify(city.stateCode)},`);
    lines.push(`    slug: ${JSON.stringify(city.slug)},`);
    lines.push(`    population: ${city.population},`);
    lines.push(`    costOfLivingIndex: ${city.costOfLivingIndex},`);
    lines.push(`    lat: ${city.lat},`);
    lines.push(`    lng: ${city.lng},`);
    lines.push(`    metroArea: ${JSON.stringify(city.metroArea)},`);
    lines.push(`    mentalHealthShortage: ${city.mentalHealthShortage},`);
    lines.push(`    healthcareSystems: ${JSON.stringify(city.healthcareSystems)},`);
    lines.push(`    nearbyCities: ${JSON.stringify(city.nearbyCities)},`);
    lines.push(`    providerRatio: ${JSON.stringify(city.providerRatio)},`);
    lines.push(`    medianIncome: ${city.medianIncome},`);
    lines.push(`    stateRank: ${city.stateRank},`);
    lines.push('  },');
  }
  
  lines.push('];');
  lines.push('');
  
  // Add lookup maps
  lines.push('// ─── Lookup Maps ──────────────────────────────────────────────');
  lines.push('');
  lines.push('/** Slug → CityData lookup */');
  lines.push('export const CITY_BY_SLUG: Record<string, CityData> = {};');
  lines.push('for (const city of CITIES) {');
  lines.push('  CITY_BY_SLUG[city.slug] = city;');
  lines.push('}');
  lines.push('');
  lines.push('/** State code → CityData[] lookup */');
  lines.push('export const CITIES_BY_STATE: Record<string, CityData[]> = {};');
  lines.push('for (const city of CITIES) {');
  lines.push('  if (!CITIES_BY_STATE[city.stateCode]) CITIES_BY_STATE[city.stateCode] = [];');
  lines.push('  CITIES_BY_STATE[city.stateCode].push(city);');
  lines.push('}');
  lines.push('');
  lines.push('/** Get a city by slug, returns undefined if not found */');
  lines.push('export function getCityBySlug(slug: string): CityData | undefined {');
  lines.push('  return CITY_BY_SLUG[slug];');
  lines.push('}');
  lines.push('');
  lines.push('/** Get all cities in a state (by state code) */');
  lines.push('export function getCitiesByState(stateCode: string): CityData[] {');
  lines.push('  return CITIES_BY_STATE[stateCode.toUpperCase()] || [];');
  lines.push('}');
  lines.push('');
  lines.push('/** Get all city slugs */');
  lines.push('export function getAllCitySlugs(): string[] {');
  lines.push('  return CITIES.map(c => c.slug);');
  lines.push('}');
  lines.push('');
  
  return lines.join('\n');
}

async function main() {
  try {
    const cities = await fetchCensusData();
    
    const tsContent = generateTypeScript(cities);
    
    const outDir = path.join(__dirname, '..', 'lib', 'pseo', 'city-data');
    const outFile = path.join(outDir, 'cities.ts');
    
    // Ensure directory exists
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    
    fs.writeFileSync(outFile, tsContent, 'utf8');
    
    console.log(`\n✅ Generated ${outFile}`);
    console.log(`   ${cities.length} cities`);
    console.log(`   ${(tsContent.length / 1024 / 1024).toFixed(2)} MB`);
    
    // Print summary by state
    const byState = {};
    for (const city of cities) {
      byState[city.stateCode] = (byState[city.stateCode] || 0) + 1;
    }
    console.log('\nCities by state (top 10):');
    const sorted = Object.entries(byState).sort((a, b) => b[1] - a[1]);
    for (const [code, count] of sorted.slice(0, 10)) {
      console.log(`   ${code}: ${count}`);
    }
    
  } catch (error) {
    console.error('Failed to generate city data:', error);
    process.exit(1);
  }
}

main();
