# Assessment certificate documents

Private, independently locked Node 24 renderer for Assessment Cloud. This is not a browser/Edge dependency or a mother-platform feature. It embeds the original signed JSON credential; the PDF itself is not digitally signed.

See [the service contract, configuration, reproduction and open launch gates](../../docs/assessment-cloud/CERTIFICATE_DOCUMENTS.md). All defaults remain off outside isolated fixtures. No service deployment is included.

```text
npm ci --prefix services/assessment-documents --workspaces=false --ignore-scripts
npm --prefix services/assessment-documents test --workspaces=false
node scripts/test-assessment-appeals-browser.mjs --certificate-documents
```
