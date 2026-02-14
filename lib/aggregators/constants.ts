/**
 * Shared constants for job aggregators.
 * Centralizing these helps maintain consistency and simplifies hyper-scaling strategies.
 */

export const SEARCH_QUERIES = [
    'PMHNP',
    'Psychiatric Nurse Practitioner',
    'Psychiatric Mental Health Nurse Practitioner',
    'Behavioral Health Nurse Practitioner',
    'Psychiatric APRN',
    'Psych NP',
    'Mental Health NP',
    'PMHNP-BC',
    'Psychiatric prescriber',
    'Telepsychiatry Nurse Practitioner',
    'Nurse Practitioner Psychiatry',
    'Psychiatric ARNP',
    'Psychiatry Nurse Practitioner',
    'Psychiatric Mental Health NP-BC',
    'New Grad PMHNP',
    'Remote PMHNP',
    'Telehealth Psychiatric Nurse Practitioner',
    'Locum Tenens PMHNP',
    'Travel Psychiatric Nurse Practitioner',
    'Correctional Psychiatric Nurse Practitioner',
    'Inpatient Psychiatric Nurse Practitioner',
    'Outpatient PMHNP',
];

export const STATES = [
    "Alabama", "Alaska", "Arizona", "Arkansas", "California",
    "Colorado", "Connecticut", "Delaware", "Florida", "Georgia",
    "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa",
    "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland",
    "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri",
    "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey",
    "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
    "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina",
    "South Dakota", "Tennessee", "Texas", "Utah", "Vermont",
    "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming",
    "Remote"
];

export const TOP_500_CITIES = [
    "New York, NY", "Los Angeles, CA", "Chicago, IL", "Houston, TX", "Phoenix, AZ",
    "Philadelphia, PA", "San Antonio, TX", "San Diego, CA", "Dallas, TX", "San Jose, CA",
    "Austin, TX", "Jacksonville, FL", "Fort Worth, TX", "Columbus, OH", "Indianapolis, IN",
    "Charlotte, NC", "San Francisco, CA", "Seattle, WA", "Denver, CO", "Oklahoma City, OK",
    "Nashville, TN", "El Paso, TX", "Washington, DC", "Boston, MA", "Las Vegas, NV",
    "Portland, OR", "Detroit, MI", "Louisville, KY", "Memphis, TN", "Baltimore, MD",
    "Milwaukee, WI", "Albuquerque, NM", "Tucson, AZ", "Fresno, CA", "Sacramento, CA",
    "Kansas City, MO", "Mesa, AZ", "Atlanta, GA", "Omaha, NE", "Colorado Springs, CO",
    "Raleigh, NC", "Long Beach, CA", "Virginia Beach, VA", "Miami, FL", "Oakland, CA",
    "Minneapolis, MN", "Tulsa, OK", "Bakersfield, CA", "Wichita, KS", "Arlington, TX",
    "Aurora, CO", "Tampa, FL", "New Orleans, LA", "Cleveland, OH", "Honolulu, HI",
    "Anaheim, CA", "Lexington, KY", "Stockton, CA", "Corpus Christi, TX", "Henderson, NV",
    "Riverside, CA", "Newark, NJ", "Saint Paul, MN", "Santa Ana, CA", "Cincinnati, OH",
    "Irvine, CA", "Orlando, FL", "Pittsburgh, PA", "St. Louis, MO", "Greensboro, NC",
    "Jersey City, NJ", "Anchorage, AK", "Lincoln, NE", "Plano, TX", "Durham, NC",
    "Buffalo, NY", "Chandler, AZ", "Chula Vista, CA", "Toledo, OH", "Madison, WI",
    "Gilbert, AZ", "Reno, NV", "Fort Wayne, IN", "North Las Vegas, NV", "St. Petersburg, FL",
    "Lubbock, TX", "Irving, TX", "Laredo, TX", "Winston-Salem, NC", "Chesapeake, VA",
    "Glendale, AZ", "Garland, TX", "Scottsdale, AZ", "Norfolk, VA", "Boise, ID",
    "Fremont, CA", "Santa Clarita, CA", "San Bernardino, CA", "Hialeah, FL", "Richmond, VA",
    "Spokane, WA", "Modesto, CA", "Durham, NC", "Grand Rapids, MI", "Tacoma, WA",
    "Fontana, CA", "Oxnard, CA", "Aurora, IL", "Moreno Valley, CA", "Akron, OH",
    "Yonkers, NY", "Columbus, GA", "Augusta, GA", "Little Rock, AR", "Amarillo, TX",
    "Mobile, AL", "Huntington Beach, CA", "Montgomery, AL", "Glendale, CA", "Shreveport, LA",
    "Grand Prairie, TX", "Tallahassee, FL", "Huntsville, AL", "Worcester, MA", "Knoxville, TN",
    "Brownsville, TX", "Overland Park, KS", "Santa Rosa, CA", "Tempe, AZ", "Providence, RI",
    "Cape Coral, FL", "Chattanooga, TN", "Rancho Cucamonga, CA", "Oceanside, CA",
    "Garden Grove, CA", "Vancouver, WA", "Sioux Falls, SD", "Ontario, CA", "Port St. Lucie, FL",
    "Peoria, AZ", "Springfield, MO", "Fort Lauderdale, FL", "Pembroke Pines, FL", "Salem, OR",
    "Lancaster, CA", "Elk Grove, CA", "Corona, CA", "Palmdale, CA", "Salinas, CA",
    "Springfield, MA", "Hayward, CA", "Paterson, NJ", "Alexandria, VA", "Macon, GA",
    "Lakewood, CO", "Kansas City, KS", "Sunnyvale, CA", "Hollywood, FL", "Clarksville, TN",
    "Naperville, IL", "Joliet, IL", "Pomona, CA", "Escondido, CA", "Surprise, AZ",
    "Rockford, IL", "Torrance, CA", "Bridgeport, CT", "Fullerton, CA", "Bellevue, WA",
    "McAllen, TX", "Pasadena, TX", "Charleston, SC", "Mesquite, TX", "Savannah, GA",
    "Killeen, TX", "Dayton, OH", "Roseville, CA", "Visalia, CA", "Denton, TX",
    "Orange, CA", "Gainesville, FL", "Miramar, FL", "Thornton, CO", "Olathe, KS",
    "Victorville, CA", "McKinney, TX", "Metairie, LA", "Simi Valley, CA", "New Haven, CT",
    "Carrollton, TX", "Midland, TX", "Stamford, CT", "Waco, TX", "Athens, GA",
    "Columbia, SC", "Warren, MI", "Frisco, TX", "Bentonville, AR", "Vallejo, CA",
    "Pearland, TX", "Independence, MO", "Ann Arbor, MI", "Berkeley, CA", "Fayetteville, NC",
    "Broken Arrow, OK", "Allentown, PA", "Columbia, MO", "Pueblo, CO", "Waterbury, CT",
    "College Station, TX", "North Charleston, SC", "Rochester, MN", "Murrieta, CA",
    "Billings, MT", "West Jordan, UT", "Round Rock, TX", "West Palm Beach, FL",
    "Everett, WA", "Temecula, CA", "South Bend, IN", "Clearwater, FL", "Manchester, NH",
    "Lowell, MA", "Miami Gardens, FL", "Costa Mesa, CA", "Fairfield, CA", "Sugar Land, TX",
    "Cambridge, MA", "Meridian, ID", "League City, TX", "Ventura, CA", "Lafayette, LA",
    "Carlsbad, CA", "Lakeland, FL", "Antioch, CA", "Lewisville, TX", "Pompano Beach, FL",
    "High Point, NC", "West Valley City, UT", "Richmond, CA", "Murfreesboro, TN", "Tyler, TX",
    "Odessa, TX", "Downey, CA", "El Monte, CA", "Gresham, OR", "Green Bay, WI",
    "Inglewood, CA", "Daly City, CA", "Burbank, CA", "West Covina, CA", "Wichita Falls, TX",
    "Arvada, CO", "Concord, CA", "San Mateo, CA", "Davie, FL", "Norwalk, CA",
    "Sandy Springs, GA", "Jurupa Valley, CA", "Rio Rancho, NM", "Rialto, CA",
    "Las Cruces, NM", "South Gate, CA", "Vacaville, CA", "Sparks, NV", "Allen, TX",
    "Boca Raton, FL", "El Cajon, CA", "Vista, CA", "Edison, NJ", "Woodbridge, NJ",
    "Lakewood, NJ", "Trenton, NJ", "Camden, NJ", "Brockton, MA", "Quincy, MA",
    "Lynn, MA", "Fall River, MA", "Newton, MA", "Cranston, RI", "Warwick, RI",
    "Nampa, ID", "Orem, UT", "Provo, UT", "Sandy, UT", "Greeley, CO",
    "Longmont, CO", "Loveland, CO", "Grand Junction, CO", "Casper, WY", "Cheyenne, WY",
    "Missoula, MT", "Great Falls, MT", "Rapid City, SD", "Fargo, ND", "Bismarck, ND",
    "Grand Forks, ND", "Sioux City, IA", "Cedar Rapids, IA", "Davenport, IA", "Des Moines, IA",
    "Iowa City, IA", "Waterloo, IA", "Topeka, KS", "Lawrence, KS", "Lenexa, KS",
    "Shawnee, KS", "Manhattan, KS", "Salina, KS", "Hutchinson, KS", "Lee's Summit, MO",
    "O'Fallon, MO", "St. Charles, MO", "Blue Springs, MO", "Liberty, MO", "St. Joseph, MO",
    "Joplin, MO", "Cape Girardeau, MO", "Norman, OK", "Edmond, OK", "Lawton, OK",
    "Enid, OK", "Stillwater, OK", "Muskogee, OK", "Conroe, TX", "Mission, TX",
    "Pharr, TX", "Edinburg, TX", "Harlingen, TX", "San Angelo, TX", "Longview, TX",
    "Bryan, TX", "Baytown, TX", "Flower Mound, TX", "Cedar Park, TX", "Georgetown, TX",
    "Pflugerville, TX", "Temple, TX", "New Braunfels, TX", "Victoria, TX", "Texas City, TX",
    "Galveston, TX", "Port Arthur, TX", "Huntsville, TX", "Sherman, TX", "Denison, TX",
    "Burleson, TX", "Mansfield, TX", "Euless, TX", "Bedford, TX", "Grapevine, TX",
    "Haltom City, TX", "Keller, TX", "Coppell, TX", "Duncanville, TX", "Lancaster, TX",
    "DeSoto, TX", "Cedar Hill, TX", "Kyle, TX", "Little Elm, TX", "Rockwall, TX",
    "Wylie, TX", "Rowlett, TX", "Sachse, TX", "Murphy, TX", "Forney, TX", "Friendswood, TX",
    "Deer Park, TX", "La Porte, TX", "Lake Jackson, TX", "Alvin, TX", "Dickinson, TX",
    "Schertz, TX", "Cibolo, TX", "San Marcos, TX", "Converse, TX", "Seguin, TX",
    "Copperas Cove, TX", "Harker Heights, TX", "Belton, TX", "Waxahachie, TX", "Midlothian, TX",
    "Corsicana, TX", "Paris, TX", "Mount Pleasant, TX", "Texarkana, TX", "Lufkin, TX",
    "Nacogdoches, TX", "Orange, TX", "Lake Charles, LA", "Bossier City, LA",
    "Kenner, LA", "Houma, LA", "Monroe, LA", "Alexandria, LA", "Gulfport, MS",
    "Jackson, MS", "Biloxi, MS", "Hattiesburg, MS", "Tuscaloosa, AL", "Hoover, AL",
    "Auburn, AL", "Decatur, AL", "Dothan, AL", "Madison, AL", "Phenix City, AL",
    "Florence, AL", "Gadsden, AL", "Prattville, AL", "Vestavia Hills, AL", "Alabaster, AL",
    "Bessemer, AL", "Enterprise, AL", "Homewood, AL", "Northport, AL", "Opelika, AL",
    "Athens, AL", "Pelham, AL", "Trussville, AL", "Foley, AL", "Fairhope, AL",
    "Daphne, AL", "Brentwood, TN", "Germantown, TN", "Collierville, TN", "Hendersonville, TN",
    "Smyrna, TN", "Franklin, TN", "Johnson City, TN", "Kingsport, TN", "Jackson, TN",
    "Cleveland, TN", "Maryville, TN", "Morristown, TN", "Columbia, TN", "Lebanon, TN",
    "Gallatin, TN", "Mount Juliet, TN", "Spring Hill, TN", "La Vergne, TN", "Cookeville, TN",
    "Oak Ridge, TN", "Farragut, TN", "Bristol, TN", "Bowling Green, KY", "Owensboro, KY",
    "Covington, KY", "Hopkinsville, KY", "Richmond, KY", "Florence, KY", "Georgetown, KY",
    "Elizabethtown, KY", "Nicholasville, KY", "Henderson, KY", "Jeffersontown, KY", "Frankfort, KY",
    "Paducah, KY", "Radcliff, KY", "Ashland, KY", "St. Matthews, KY", "Bloomington, IN",
    "Carmel, IN", "Fishers, IN", "Hammond, IN", "Gary, IN", "Lafayette, IN",
    "Muncie, IN", "Terre Haute, IN", "Kokomo, IN", "Noblesville, IN", "Greenwood, IN",
    "Anderson, IN", "Elkhart, IN", "Mishawaka, IN", "Lawrence, IN", "Columbus, IN",
    "Jeffersonville, IN", "New Albany, IN", "Portage, IN", "Merrillville, IN", "Valparaiso, IN",
    "Goshen, IN", "Michigan City, IN", "Granger, IN", "Plainfield, IN", "Brownsburg, IN",
    "Zionsville, IN", "Avon, IN", "Franklin, IN", "Shelbyville, IN", "Marion, IN",
    "Richmond, IN", "East Chicago, IN", "Schererville, IN", "Hobart, IN", "Crown Point, IN",
    "St. John, IN", "Dyer, IN", "Munster, IN", "Highland, IN", "Griffith, IN",
    "Cedar Lake, IN"
];

export const NOTABLE_COUNTIES = [
    // California (12)
    "Los Angeles, CA", "San Diego, CA", "Orange, CA", "Riverside, CA", "San Bernardino, CA",
    "Santa Clara, CA", "Alameda, CA", "Sacramento, CA", "Contra Costa, CA", "San Francisco, CA",
    "Fresno, CA", "Ventura, CA",
    // Texas (14)
    "Harris, TX", "Dallas, TX", "Tarrant, TX", "Bexar, TX", "Travis, TX", "Collin, TX",
    "Denton, TX", "Hidalgo, TX", "El Paso, TX", "Fort Bend, TX", "Montgomery, TX", "Williamson, TX",
    "Nueces, TX", "Lubbock, TX",
    // Florida (12)
    "Miami-Dade, FL", "Broward, FL", "Palm Beach, FL", "Hillsborough, FL", "Orange, FL", "Duval, FL",
    "Pinellas, FL", "Lee, FL", "Polk, FL", "Brevard, FL", "Volusia, FL", "Pasco, FL",
    // New York (11)
    "New York, NY", "Kings, NY", "Queens, NY", "Bronx, NY", "Nassau, NY", "Suffolk, NY",
    "Erie, NY", "Monroe, NY", "Westchester, NY", "Onondaga, NY", "Albany, NY",
    // Pennsylvania (11)
    "Philadelphia, PA", "Allegheny, PA", "Montgomery, PA", "Bucks, PA", "Delaware, PA",
    "Lancaster, PA", "Chester, PA", "York, PA", "Berks, PA", "Lehigh, PA", "Luzerne, PA",
    // Illinois (12)
    "Cook, IL", "DuPage, IL", "Lake, IL", "Will, IL", "Kane, IL", "McHenry, IL",
    "Winnebago, IL", "St. Clair, IL", "Madison, IL", "Sangamon, IL", "Peoria, IL", "McLean, IL",
    // Washington (11)
    "King, WA", "Pierce, WA", "Snohomish, WA", "Spokane, WA", "Clark, WA", "Thurston, WA",
    "Kitsap, WA", "Yakima, WA", "Whatcom, WA", "Benton, WA", "Skagit, WA",
    // Ohio (8)
    "Cuyahoga, OH", "Franklin, OH", "Hamilton, OH", "Summit, OH", "Montgomery, OH",
    "Lucas, OH", "Stark, OH", "Butler, OH",
    // Georgia (6)
    "Fulton, GA", "Gwinnett, GA", "DeKalb, GA", "Cobb, GA", "Chatham, GA", "Richmond, GA",
    // North Carolina (7)
    "Mecklenburg, NC", "Wake, NC", "Guilford, NC", "Forsyth, NC", "Cumberland, NC",
    "Durham, NC", "Buncombe, NC",
    // Michigan (6)
    "Wayne, MI", "Oakland, MI", "Macomb, MI", "Kent, MI", "Washtenaw, MI", "Genesee, MI",
    // New Jersey (6)
    "Bergen, NJ", "Middlesex, NJ", "Essex, NJ", "Hudson, NJ", "Monmouth, NJ", "Camden, NJ",
    // Virginia (6)
    "Fairfax, VA", "Virginia Beach, VA", "Prince William, VA", "Loudoun, VA", "Chesterfield, VA", "Henrico, VA",
    // Massachusetts (5)
    "Suffolk, MA", "Middlesex, MA", "Worcester, MA", "Essex, MA", "Norfolk, MA",
    // Arizona (4)
    "Maricopa, AZ", "Pima, AZ", "Pinal, AZ", "Yavapai, AZ",
    // Tennessee (5)
    "Davidson, TN", "Shelby, TN", "Knox, TN", "Hamilton, TN", "Rutherford, TN",
    // Indiana (5)
    "Marion, IN", "Lake, IN", "Allen, IN", "Hamilton, IN", "St. Joseph, IN",
    // Missouri (4)
    "St. Louis, MO", "Jackson, MO", "St. Charles, MO", "Greene, MO",
    // Maryland (4)
    "Montgomery, MD", "Prince George's, MD", "Baltimore, MD", "Anne Arundel, MD",
    // Wisconsin (4)
    "Milwaukee, WI", "Dane, WI", "Waukesha, WI", "Brown, WI",
    // Minnesota (4)
    "Hennepin, MN", "Ramsey, MN", "Dakota, MN", "Anoka, MN",
    // Colorado (4)
    "Denver, CO", "El Paso, CO", "Arapahoe, CO", "Jefferson, CO",
    // Alabama (3)
    "Jefferson, AL", "Madison, AL", "Mobile, AL",
    // South Carolina (3)
    "Charleston, SC", "Greenville, SC", "Richland, SC",
    // Louisiana (3)
    "Orleans, LA", "East Baton Rouge, LA", "Jefferson, LA",
    // Kentucky (3)
    "Jefferson, KY", "Fayette, KY", "Kenton, KY",
    // Oregon (3)
    "Multnomah, OR", "Washington, OR", "Clackamas, OR",
    // Oklahoma (3)
    "Oklahoma, OK", "Tulsa, OK", "Cleveland, OK",
    // Connecticut (3)
    "Hartford, CT", "New Haven, CT", "Fairfield, CT",
    // Iowa (3)
    "Polk, IA", "Linn, IA", "Scott, IA",
    // Mississippi (2)
    "Hinds, MS", "Harrison, MS",
    // Arkansas (2)
    "Pulaski, AR", "Benton, AR",
    // Kansas (2)
    "Johnson, KS", "Sedgwick, KS",
    // Utah (3)
    "Salt Lake, UT", "Utah, UT", "Davis, UT",
    // Nevada (2)
    "Clark, NV", "Washoe, NV",
    // New Mexico (2)
    "Bernalillo, NM", "Dona Ana, NM",
    // Nebraska (2)
    "Douglas, NE", "Lancaster, NE",
    // Idaho (2)
    "Ada, ID", "Canyon, ID",
    // Hawaii (2)
    "Honolulu, HI", "Maui, HI",
    // New Hampshire (2)
    "Hillsborough, NH", "Rockingham, NH",
    // Maine (2)
    "Cumberland, ME", "York, ME",
    // Montana (2)
    "Yellowstone, MT", "Missoula, MT",
    // Rhode Island (1)
    "Providence, RI",
    // Delaware (1)
    "New Castle, DE",
    // South Dakota (1)
    "Minnehaha, SD",
    // North Dakota (1)
    "Cass, ND",
    // Alaska (1)
    "Anchorage, AK",
    // Vermont (1)
    "Chittenden, VT",
    // Wyoming (1)
    "Laramie, WY",
    // West Virginia (2)
    "Kanawha, WV", "Cabell, WV",
    // Washington DC
    "District of Columbia, DC"
];

export const TOP_EMPLOYERS = [
    'LifeStance Health', 'Thriveworks', 'Talkiatry', 'Mindpath Health', 'Geode Health',
    'Foresight Mental Health', 'Refresh Mental Health', 'Ellie Mental Health', 'HCA Healthcare',
    'Acadia Healthcare', 'Universal Health Services', 'Veterans Affairs', 'CVS Health',
    'UnitedHealth Group', 'Kaiser Permanente', 'Landmark Health', 'GuideWell', 'Centene',
    'Eleanor Health', 'Bicycle Health', 'Iris Telehealth', 'SonderMind', 'Oak Street Health',
    'VillageMD', 'One Medical', 'ChenMed', 'Brightside Health', 'CommonSpirit Health',
    'Advocate Health', 'Providence Health', 'UPMC', 'Ascension', 'Trinity Health',
    'Mass General Brigham', 'Tenet Healthcare', 'AdventHealth', 'Mayo Clinic',
    'Northwell Health', 'Sutter Health', 'Intermountain Healthcare', 'Corewell Health',
    'Baylor Scott & White', 'Cleveland Clinic', 'Memorial Hermann', 'Novant Health',
    'Mercy Health', 'Banner Health', 'WellStar Health', 'Inova Health', 'Bon Secours',
    'Christus Health', 'Highmark Health', 'Sentara Healthcare', 'Main Line Health',
    'Sharp HealthCare', 'OhioHealth', 'Scripps Health', 'Spectrum Health', 'Beaumont Health',
    'Fairview Health', 'Atrium Health', 'Piedmont Healthcare', 'Ochsner Health',
    'Legacy Health', 'MultiCare Health', 'Henry Ford Health', 'BJC HealthCare',
    'SSM Health', 'Gundersen Health', 'Marshfield Clinic', 'Aspirus Health', 'Sanford Health',
    'Essentia Health', 'LifePoint Health', 'Community Health Systems', 'Prime Healthcare'
];
