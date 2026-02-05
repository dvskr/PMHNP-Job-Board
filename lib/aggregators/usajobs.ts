interface USAJobsPosition {
  PositionID: string;
  PositionTitle: string;
  PositionURI: string;
  PositionLocation: Array<{
    LocationName: string;
    CityName: string;
    CountryCode: string;
  }>;
  OrganizationName: string;
  DepartmentName: string;
  JobCategory: Array<{
    Name: string;
    Code: string;
  }>;
  JobGrade: Array<{
    Code: string;
  }>;
  PositionRemuneration: Array<{
    MinimumRange: string;
    MaximumRange: string;
    RateIntervalCode: string;
  }>;
  PositionStartDate: string;
  PositionEndDate: string;
  PublicationStartDate: string;
  ApplicationCloseDate: string;
  PositionFormattedDescription: Array<{
    Content: string;
    Label: string;
    LabelDescription: string;
  }>;
  UserArea: {
    Details: {
      JobSummary: string;
      WhoMayApply: {
        Name: string;
        Code: string;
      };
      LowGrade: string;
      HighGrade: string;
      PromotionPotential: string;
      HiringPath: string[];
      TotalOpenings: string;
      AgencyMarketingStatement: string;
      TravelCode: string;
      ApplyOnlineUrl: string;
      DetailStatusUrl: string;
      MajorDuties: string[];
      Education: string;
      Requirements: string;
      Evaluations: string;
      HowToApply: string;
      WhatToExpectNext: string;
      RequiredDocuments: string;
      Benefits: string;
      BenefitsUrl: string;
      BenefitsDisplayDefaultText: boolean;
      OtherInformation: string;
      KeyRequirements: string[];
      WithinArea: string;
      CommuteDistance: string;
      ServiceType: string;
      AnnouncementClosingType: string;
      AgencyContactEmail: string;
      AgencyContactPhone: string;
      SecurityClearance: string;
      DrugTestRequired: string;
      PositionSensitivitiy: string;
      AdjudicationType: string[];
      TeleworkEligible: boolean;
      RemoteIndicator: boolean;
    };
    IsRadialSearch: boolean;
  };
}

interface USAJobsSearchResult {
  MatchedObjectId: string;
  MatchedObjectDescriptor: USAJobsPosition;
  RelevanceRank: number;
}

interface USAJobsResponse {
  SearchResult: {
    SearchResultCount: number;
    SearchResultCountAll: number;
    SearchResultItems: USAJobsSearchResult[];
  };
}

export interface USAJobRaw {
  id: string;
  title: string;
  company: string;
  location: string;
  description: string;
  salary_min: number | null;
  salary_max: number | null;
  salary_period: string | null;
  redirect_url: string;
  remote: boolean;
}

const SEARCH_KEYWORDS = [
  'Psychiatric Nurse Practitioner',
  'PMHNP',
  'Psychiatric Mental Health Nurse Practitioner',
  'Psychiatric APRN',
  'Mental Health Nurse Practitioner',
  'Psychiatric NP',
  'Behavioral Health Nurse Practitioner',
];

export async function fetchUSAJobs(): Promise<USAJobRaw[]> {
  const apiKey = process.env.USAJOBS_API_KEY;
  const userAgent = process.env.USAJOBS_USER_AGENT || 'pmhnp-jobs@example.com';

  if (!apiKey) {
    console.error('[USAJobs] API key not configured');
    return [];
  }

  const baseUrl = 'https://data.usajobs.gov/api/search';
  const allJobs: USAJobRaw[] = [];
  const seenIds = new Set<string>();

  console.log(`[USAJobs] Searching with ${SEARCH_KEYWORDS.length} keywords...`);

  for (const keyword of SEARCH_KEYWORDS) {
    try {
      const params = new URLSearchParams({
        Keyword: keyword,
        ResultsPerPage: '100',
      });

      const response = await fetch(`${baseUrl}?${params.toString()}`, {
        headers: {
          'Authorization-Key': apiKey,
          'User-Agent': userAgent,
          'Host': 'data.usajobs.gov',
        },
      });

      if (!response.ok) {
        console.warn(`[USAJobs] HTTP ${response.status} for keyword "${keyword}"`);
        continue;
      }

      const data: USAJobsResponse = await response.json();
      const results = data.SearchResult?.SearchResultItems || [];
      const totalAvailable = data.SearchResult?.SearchResultCountAll || 0;

      console.log(`[USAJobs] "${keyword}": ${results.length} returned (${totalAvailable} total available)`);

      let addedFromKeyword = 0;

      for (const item of results) {
        const job = item.MatchedObjectDescriptor;
        const positionId = job.PositionID;

        // Skip duplicates across keyword searches
        if (seenIds.has(positionId)) {
          continue;
        }
        seenIds.add(positionId);

        const remuneration = job.PositionRemuneration?.[0];
        const location = job.PositionLocation?.[0]?.LocationName || 'United States';
        const details = job.UserArea?.Details;

        const descriptionParts = [
          details?.JobSummary,
          details?.MajorDuties?.join('\n'),
          details?.Requirements,
          details?.Education,
        ].filter(Boolean);

        allJobs.push({
          id: positionId,
          title: job.PositionTitle,
          company: job.OrganizationName || job.DepartmentName,
          location,
          description: descriptionParts.join('\n\n') || job.PositionFormattedDescription?.[0]?.Content || '',
          salary_min: remuneration?.MinimumRange ? parseFloat(remuneration.MinimumRange) : null,
          salary_max: remuneration?.MaximumRange ? parseFloat(remuneration.MaximumRange) : null,
          salary_period: remuneration?.RateIntervalCode === 'PA' ? 'year' : remuneration?.RateIntervalCode === 'PH' ? 'hour' : null,
          redirect_url: details?.ApplyOnlineUrl || job.PositionURI,
          remote: details?.RemoteIndicator || false,
        });

        addedFromKeyword++;
      }

      console.log(`[USAJobs] "${keyword}": ${addedFromKeyword} new unique jobs added`);

      // Rate limiting: 500ms between keyword searches
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.error(`[USAJobs] Error fetching keyword "${keyword}":`, error);
    }
  }

  console.log(`[USAJobs] Total unique jobs fetched: ${allJobs.length}`);
  return allJobs;
}

