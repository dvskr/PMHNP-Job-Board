import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer';

// Define styles for the PDF
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 11,
    fontFamily: 'Helvetica',
  },
  header: {
    marginBottom: 30,
    borderBottom: '2px solid #3b82f6',
    paddingBottom: 15,
  },
  companyName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e40af',
    marginBottom: 5,
  },
  invoiceTitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#374151',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  label: {
    fontSize: 11,
    color: '#6b7280',
  },
  value: {
    fontSize: 11,
    color: '#111827',
  },
  table: {
    marginTop: 20,
    marginBottom: 30,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    padding: 10,
    borderBottom: '1px solid #d1d5db',
  },
  tableRow: {
    flexDirection: 'row',
    padding: 10,
    borderBottom: '1px solid #e5e7eb',
  },
  tableColDescription: {
    width: '60%',
  },
  tableColAmount: {
    width: '40%',
    textAlign: 'right',
  },
  tableHeaderText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#374151',
  },
  tableCellText: {
    fontSize: 11,
    color: '#111827',
  },
  totalSection: {
    marginTop: 20,
    paddingTop: 15,
    borderTop: '2px solid #d1d5db',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 5,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#111827',
    marginRight: 30,
  },
  totalAmount: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1e40af',
    width: 100,
    textAlign: 'right',
  },
  footer: {
    position: 'absolute',
    bottom: 40,
    left: 40,
    right: 40,
    fontSize: 9,
    color: '#9ca3af',
    textAlign: 'center',
    borderTop: '1px solid #e5e7eb',
    paddingTop: 15,
  },
});

interface InvoiceData {
  invoiceNumber: string;
  date: Date;
  employerName: string;
  employerEmail: string;
  jobTitle: string;
  amount: number; // in cents
  tier: string;
}

// Format date as MM/DD/YYYY
const formatDate = (date: Date): string => {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
};

// Format amount from cents to dollars
const formatAmount = (cents: number): string => {
  const dollars = cents / 100;
  return `$${dollars.toFixed(2)}`;
};

// Create the PDF document
const InvoiceDocument = ({ data }: { data: InvoiceData }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.companyName}>PMHNP Jobs</Text>
        <Text style={styles.invoiceTitle}>Invoice</Text>
      </View>

      {/* Invoice Details */}
      <View style={styles.section}>
        <View style={styles.row}>
          <View>
            <Text style={styles.label}>Invoice Number</Text>
            <Text style={styles.value}>{data.invoiceNumber}</Text>
          </View>
          <View>
            <Text style={styles.label}>Date</Text>
            <Text style={styles.value}>{formatDate(data.date)}</Text>
          </View>
        </View>
      </View>

      {/* Bill To */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Bill To:</Text>
        <Text style={styles.value}>{data.employerName}</Text>
        <Text style={styles.value}>{data.employerEmail}</Text>
      </View>

      {/* Items Table */}
      <View style={styles.table}>
        {/* Table Header */}
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderText, styles.tableColDescription]}>
            Description
          </Text>
          <Text style={[styles.tableHeaderText, styles.tableColAmount]}>
            Amount
          </Text>
        </View>

        {/* Table Row */}
        <View style={styles.tableRow}>
          <View style={styles.tableColDescription}>
            <Text style={styles.tableCellText}>
              Job Posting - {data.tier.charAt(0).toUpperCase() + data.tier.slice(1)}
            </Text>
            <Text style={[styles.tableCellText, { fontSize: 9, color: '#6b7280', marginTop: 3 }]}>
              {data.jobTitle}
            </Text>
          </View>
          <Text style={[styles.tableCellText, styles.tableColAmount]}>
            {formatAmount(data.amount)}
          </Text>
        </View>
      </View>

      {/* Total */}
      <View style={styles.totalSection}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total:</Text>
          <Text style={styles.totalAmount}>{formatAmount(data.amount)}</Text>
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text>Thank you for using PMHNP Jobs!</Text>
        <Text style={{ marginTop: 5 }}>
          Questions? Contact us at support@pmhnpjobs.com
        </Text>
      </View>
    </Page>
  </Document>
);

export async function generateInvoice(data: InvoiceData): Promise<Buffer> {
  try {
    // Generate the PDF
    const doc = <InvoiceDocument data={data} />;
    const asPdf = pdf(doc);
    const blob = await asPdf.toBlob();
    
    // Convert blob to buffer
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    return buffer;
  } catch (error) {
    console.error('Error generating invoice:', error);
    throw new Error('Failed to generate invoice PDF');
  }
}

