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

export async function fetchUSAJobs(): Promise<USAJobRaw[]> {
  const apiKey = process.env.USAJOBS_API_KEY;
  const userAgent = process.env.USAJOBS_USER_AGENT || 'pmhnp-jobs@example.com';

  if (!apiKey) {
    console.error('USAJobs API key not configured');
    return [];
  }

  const baseUrl = 'https://data.usajobs.gov/api/search';
  const params = new URLSearchParams({
    Keyword: 'Psychiatric Nurse Practitioner',
    ResultsPerPage: '100',
  });

  try {
    const response = await fetch(`${baseUrl}?${params.toString()}`, {
      headers: {
        'Authorization-Key': apiKey,
        'User-Agent': userAgent,
        'Host': 'data.usajobs.gov',
      },
    });

    if (!response.ok) {
      throw new Error(`USAJobs API error: ${response.status} ${response.statusText}`);
    }

    const data: USAJobsResponse = await response.json();
    const results = data.SearchResult?.SearchResultItems || [];

    return results.map((item) => {
      const job = item.MatchedObjectDescriptor;
      const remuneration = job.PositionRemuneration?.[0];
      const location = job.PositionLocation?.[0]?.LocationName || 'United States';
      const details = job.UserArea?.Details;

      // Build description from available fields
      const descriptionParts = [
        details?.JobSummary,
        details?.MajorDuties?.join('\n'),
        details?.Requirements,
        details?.Education,
      ].filter(Boolean);

      return {
        id: job.PositionID,
        title: job.PositionTitle,
        company: job.OrganizationName || job.DepartmentName,
        location,
        description: descriptionParts.join('\n\n') || job.PositionFormattedDescription?.[0]?.Content || '',
        salary_min: remuneration?.MinimumRange ? parseFloat(remuneration.MinimumRange) : null,
        salary_max: remuneration?.MaximumRange ? parseFloat(remuneration.MaximumRange) : null,
        salary_period: remuneration?.RateIntervalCode === 'PA' ? 'year' : remuneration?.RateIntervalCode === 'PH' ? 'hour' : null,
        redirect_url: details?.ApplyOnlineUrl || job.PositionURI,
        remote: details?.RemoteIndicator || false,
      };
    });
  } catch (error) {
    console.error('Error fetching USAJobs:', error);
    return [];
  }
}

