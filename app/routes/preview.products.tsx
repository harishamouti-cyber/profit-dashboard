const rows = [
  ["Heavyweight tee", "42", "1", "$1,260.00", "$420.00", "$48.00", "$792.00", "success", "Good 62.9%", "Costed"],
  ["Canvas tote", "18", "0", "$540.00", "$216.00", "$22.00", "$302.00", "success", "Good 55.9%", "Costed"],
  ["Gift wrap", "30", "2", "$90.00", "$60.00", "$8.00", "$22.00", "warning", "Watch 24.4%", "Costed"],
  ["Sample kit", "6", "1", "$120.00", "$108.00", "$6.00", "$6.00", "critical", "Low 5.0%", "Missing"],
] as const;

export default function PreviewProducts() {
  return (
    <s-page heading="Product profit">
      <s-stack direction="block" gap="base">
        <s-paragraph>Ad spend and expenses are not allocated to products. Amounts are in USD.</s-paragraph>
        <s-search-field label="Search products" value="tee" />
        <s-table>
          <s-table-header-row>
            <s-table-header>Product</s-table-header>
            <s-table-header>Units</s-table-header>
            <s-table-header>Returned</s-table-header>
            <s-table-header>Net sales</s-table-header>
            <s-table-header>COGS</s-table-header>
            <s-table-header>Fees</s-table-header>
            <s-table-header>Gross profit</s-table-header>
            <s-table-header>Margin</s-table-header>
            <s-table-header>Cost</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {rows.map((row) => (
              <s-table-row key={row[0]}>
                <s-table-cell>{row[0]}</s-table-cell>
                <s-table-cell>{row[1]}</s-table-cell>
                <s-table-cell>{row[2]}</s-table-cell>
                <s-table-cell>{row[3]}</s-table-cell>
                <s-table-cell>{row[4]}</s-table-cell>
                <s-table-cell>{row[5]}</s-table-cell>
                <s-table-cell>{row[6]}</s-table-cell>
                <s-table-cell><s-badge tone={row[7]}>{row[8]}</s-badge></s-table-cell>
                <s-table-cell><s-badge tone={row[9] === "Costed" ? "success" : "warning"}>{row[9]}</s-badge></s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
      </s-stack>
    </s-page>
  );
}
