interface OrganizationStructuredDataProps {
  baseUrl: string;
}

export default function OrganizationStructuredData({ baseUrl }: OrganizationStructuredDataProps) {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "PMHNP Hiring",
    "url": baseUrl,
    "logo": {
      "@type": "ImageObject",
      "url": `${baseUrl}/pmhnp_logo.png`
    },
    "image": `${baseUrl}/pmhnp_logo.png`,
    "description": "The #1 job board for Psychiatric Mental Health Nurse Practitioners. 10,000+ PMHNP jobs from 3,000+ companies across 50 states.",
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

