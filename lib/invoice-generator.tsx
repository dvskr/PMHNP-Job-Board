import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer';

// Styles for the PDF
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 11,
    fontFamily: 'Helvetica',
  },
  topBar: {
    height: 6,
    backgroundColor: '#14B8A6',
    marginHorizontal: -40,
    marginTop: -40,
    marginBottom: 30,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 30,
  },
  invoiceTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#0F172A',
  },
  paidStamp: {
    backgroundColor: '#D1FAE5',
    color: '#047857',
    fontSize: 14,
    fontWeight: 'bold',
    padding: '6px 14px',
    borderRadius: 4,
    border: '1.5px solid #10B981',
  },
  metaRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  metaLabel: {
    width: 110,
    color: '#374151',
    fontWeight: 'bold',
    fontSize: 11,
  },
  metaValue: {
    color: '#111827',
    fontSize: 11,
  },
  addressBlock: {
    width: '48%',
  },
  addressTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 6,
  },
  addressLine: {
    fontSize: 10,
    color: '#374151',
    marginBottom: 2,
  },
  addressGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 30,
    marginTop: 18,
  },
  amountPaidLine: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0F172A',
    marginBottom: 20,
  },
  jobLine: {
    fontSize: 11,
    color: '#374151',
    marginBottom: 18,
  },
  table: {
    marginTop: 8,
    marginBottom: 18,
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottom: '1px solid #1F2937',
    paddingBottom: 8,
    marginBottom: 4,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottom: '1px solid #E5E7EB',
  },
  colDescription: { width: '54%', fontSize: 11, color: '#111827' },
  colQty: { width: '10%', textAlign: 'right', fontSize: 11, color: '#111827' },
  colUnit: { width: '18%', textAlign: 'right', fontSize: 11, color: '#111827' },
  colAmount: { width: '18%', textAlign: 'right', fontSize: 11, color: '#111827' },
  colDescriptionHeader: { width: '54%', fontSize: 10, color: '#6B7280', fontWeight: 'bold' },
  colQtyHeader: { width: '10%', textAlign: 'right', fontSize: 10, color: '#6B7280', fontWeight: 'bold' },
  colUnitHeader: { width: '18%', textAlign: 'right', fontSize: 10, color: '#6B7280', fontWeight: 'bold' },
  colAmountHeader: { width: '18%', textAlign: 'right', fontSize: 10, color: '#6B7280', fontWeight: 'bold' },
  totalsBlock: {
    marginTop: 10,
    paddingTop: 10,
    alignItems: 'flex-end',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 4,
    width: 240,
  },
  totalLabel: {
    width: 120,
    fontSize: 11,
    color: '#374151',
    textAlign: 'right',
    paddingRight: 12,
  },
  totalValue: {
    width: 100,
    fontSize: 11,
    color: '#111827',
    textAlign: 'right',
  },
  grandTotalLabel: {
    width: 120,
    fontSize: 12,
    color: '#0F172A',
    fontWeight: 'bold',
    textAlign: 'right',
    paddingRight: 12,
  },
  grandTotalValue: {
    width: 100,
    fontSize: 12,
    color: '#0F172A',
    fontWeight: 'bold',
    textAlign: 'right',
  },
  paymentBlock: {
    marginTop: 30,
    paddingTop: 14,
    borderTop: '1px solid #E5E7EB',
  },
  paymentTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#047857',
    marginBottom: 6,
  },
  footer: {
    position: 'absolute',
    bottom: 40,
    left: 40,
    right: 40,
    fontSize: 9,
    color: '#9CA3AF',
    textAlign: 'center',
    borderTop: '1px solid #E5E7EB',
    paddingTop: 12,
  },
});

export type InvoiceStatus = 'paid' | 'due' | 'refunded';

export interface InvoiceData {
  invoiceNumber: string;
  date: Date;
  paidAt?: Date | null;
  status?: InvoiceStatus;
  // From/seller block — defaults to PMHNP Hiring.
  fromName?: string;
  fromAddressLines?: ReadonlyArray<string>;
  fromEmail?: string;
  // Bill-to block.
  employerName: string;
  employerEmail: string;
  billToAddressLines?: ReadonlyArray<string>;
  // Line item.
  jobTitle: string;
  amount: number; // in cents
  tier: string;
  currency?: string;
  // Payment method, when known.
  paymentMethodLast4?: string | null;
  paymentMethodBrand?: string | null;
}

const formatDate = (date: Date): string => {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
};

const formatAmount = (cents: number, currency: string = 'USD'): string => {
  const dollars = cents / 100;
  const symbol = currency.toLowerCase() === 'usd' ? 'US$' : `${currency.toUpperCase()} `;
  return `${symbol}${dollars.toFixed(2)}`;
};

const DEFAULT_FROM_NAME = 'PMHNP Hiring';
const DEFAULT_FROM_ADDRESS: ReadonlyArray<string> = [
  '30 North Gould Street',
  'Sheridan, Wyoming 82801',
  'United States',
];
const DEFAULT_FROM_EMAIL = 'support@pmhnphiring.com';

const InvoiceDocument = ({ data }: { data: InvoiceData }) => {
  const status: InvoiceStatus = data.status ?? 'paid';
  const fromName = data.fromName ?? DEFAULT_FROM_NAME;
  const fromAddress = data.fromAddressLines ?? DEFAULT_FROM_ADDRESS;
  const fromEmail = data.fromEmail ?? DEFAULT_FROM_EMAIL;
  const billToAddress = data.billToAddressLines ?? [];
  const currency = data.currency ?? 'USD';

  const showPaid = status === 'paid';
  const showRefunded = status === 'refunded';
  const stampText = showRefunded ? 'REFUNDED' : showPaid ? 'PAID' : 'DUE';
  const stampStyle = showRefunded
    ? { ...styles.paidStamp, backgroundColor: '#FEE2E2', color: '#991B1B', border: '1.5px solid #DC2626' }
    : showPaid
      ? styles.paidStamp
      : { ...styles.paidStamp, backgroundColor: '#FEF3C7', color: '#92400E', border: '1.5px solid #D97706' };

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.topBar} />

        {/* Title + status stamp */}
        <View style={styles.headerRow}>
          <Text style={styles.invoiceTitle}>Invoice</Text>
          <Text style={stampStyle}>{stampText}</Text>
        </View>

        {/* Meta */}
        <View style={{ marginBottom: 8 }}>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Invoice number</Text>
            <Text style={styles.metaValue}>{data.invoiceNumber}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Date of issue</Text>
            <Text style={styles.metaValue}>{formatDate(data.date)}</Text>
          </View>
          {showPaid && data.paidAt ? (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Date paid</Text>
              <Text style={styles.metaValue}>{formatDate(data.paidAt)}</Text>
            </View>
          ) : null}
        </View>

        {/* From / Bill to */}
        <View style={styles.addressGrid}>
          <View style={styles.addressBlock}>
            <Text style={styles.addressTitle}>{fromName}</Text>
            {fromAddress.map((line, i) => (
              <Text key={i} style={styles.addressLine}>{line}</Text>
            ))}
            <Text style={styles.addressLine}>{fromEmail}</Text>
          </View>
          <View style={styles.addressBlock}>
            <Text style={styles.addressTitle}>Bill to</Text>
            <Text style={styles.addressLine}>{data.employerName}</Text>
            {billToAddress.map((line, i) => (
              <Text key={i} style={styles.addressLine}>{line}</Text>
            ))}
            <Text style={styles.addressLine}>{data.employerEmail}</Text>
          </View>
        </View>

        {/* Amount line */}
        <Text style={styles.amountPaidLine}>
          {showPaid
            ? `${formatAmount(data.amount, currency)} paid ${data.paidAt ? `on ${formatDate(data.paidAt)}` : ''}`
            : showRefunded
              ? `${formatAmount(data.amount, currency)} refunded`
              : `${formatAmount(data.amount, currency)} due ${formatDate(data.date)}`}
        </Text>
        <Text style={styles.jobLine}>Job Post: {data.jobTitle}</Text>

        {/* Line items */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.colDescriptionHeader}>Description</Text>
            <Text style={styles.colQtyHeader}>Qty</Text>
            <Text style={styles.colUnitHeader}>Unit price</Text>
            <Text style={styles.colAmountHeader}>Amount</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.colDescription}>Job Post: {data.jobTitle}</Text>
            <Text style={styles.colQty}>1</Text>
            <Text style={styles.colUnit}>{formatAmount(data.amount, currency)}</Text>
            <Text style={styles.colAmount}>{formatAmount(data.amount, currency)}</Text>
          </View>
        </View>

        {/* Totals */}
        <View style={styles.totalsBlock}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{formatAmount(data.amount, currency)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatAmount(data.amount, currency)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.grandTotalLabel}>{showPaid ? 'Amount paid' : showRefunded ? 'Refunded' : 'Amount due'}</Text>
            <Text style={styles.grandTotalValue}>{formatAmount(data.amount, currency)}</Text>
          </View>
        </View>

        {/* Payment details */}
        {showPaid && (data.paymentMethodLast4 || data.paymentMethodBrand) ? (
          <View style={styles.paymentBlock}>
            <Text style={styles.paymentTitle}>Payment received</Text>
            <Text style={styles.addressLine}>
              {data.paymentMethodBrand
                ? `${data.paymentMethodBrand.charAt(0).toUpperCase() + data.paymentMethodBrand.slice(1)} `
                : ''}
              {data.paymentMethodLast4 ? `•••• ${data.paymentMethodLast4}` : ''}
              {data.paidAt ? ` · ${formatDate(data.paidAt)}` : ''}
            </Text>
          </View>
        ) : null}

        <View style={styles.footer}>
          <Text>Thank you for using PMHNP Hiring.</Text>
          <Text style={{ marginTop: 4 }}>Questions? support@pmhnphiring.com</Text>
          <Text style={{ marginTop: 8, fontSize: 8, color: '#9CA3AF' }}>
            Akari Labs LLC · 30 North Gould Street, Sheridan, WY 82801, United States
          </Text>
        </View>
      </Page>
    </Document>
  );
};

export async function generateInvoice(data: InvoiceData): Promise<Buffer> {
  const doc = <InvoiceDocument data={data} />;
  const asPdf = pdf(doc);
  const blob = await asPdf.toBlob();
  const arrayBuffer = await blob.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
