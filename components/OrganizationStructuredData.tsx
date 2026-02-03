interface OrganizationStructuredDataProps {
  baseUrl: string;
}

export default function OrganizationStructuredData({ baseUrl }: OrganizationStructuredDataProps) {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "PMHNP Jobs",
    "url": baseUrl,
    "logo": {
      "@type": "ImageObject",
      "url": `${baseUrl}/pmhnp_logo.png`
    },
    "image": `${baseUrl}/pmhnp_logo.png`,
    "description": "The #1 job board for Psychiatric Mental Health Nurse Practitioners. Find remote and in-person PMHNP jobs with salary transparency.",
    "contactPoint": {
      "@type": "ContactPoint",
      "email": "support@pmhnphiring.com",
      "contactType": "customer service"
    },
    "sameAs": [
      // Add social links when available
    ]
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  );
}

