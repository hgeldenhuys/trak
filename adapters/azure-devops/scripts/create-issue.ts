/**
 * Create a test Issue in Azure DevOps (Basic process template)
 */
import { ADOClient } from '../src/api';

const pat = process.argv[2] || process.env.ADO_PAT;
if (!pat) {
  console.error('Usage: bun run scripts/create-issue.ts <PAT>');
  process.exit(1);
}

const client = new ADOClient(pat, {
  organization: 'ively',
  project: 'ively.core'
});

async function main() {
  console.log('Creating Issue in Azure DevOps...');
  
  // Use "Issue" for Basic process template
  const workItem = await client.createWorkItem('Issue', {
    'System.Title': 'Test Issue from trak-ado adapter',
    'System.Description': '<p>Created via <strong>trak Azure DevOps adapter</strong> to test bidirectional sync.</p>',
  });

  console.log('\n✅ Work Item Created:');
  console.log('  ID:', workItem.id);
  console.log('  Title:', workItem.fields['System.Title']);
  console.log('  State:', workItem.fields['System.State']);
  console.log('  URL:', workItem._links?.html?.href || `https://dev.azure.com/ively/ively.core/_workitems/edit/${workItem.id}`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
