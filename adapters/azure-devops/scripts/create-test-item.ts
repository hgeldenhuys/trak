/**
 * Create a test work item in Azure DevOps
 */
import { ADOClient } from '../src/api';

const pat = process.argv[2] || process.env.ADO_PAT;
if (!pat) {
  console.error('Usage: bun run scripts/create-test-item.ts <PAT>');
  console.error('  or set ADO_PAT environment variable');
  process.exit(1);
}

const client = new ADOClient(pat, {
  organization: 'ively',
  project: 'ively.core'
});

async function main() {
  console.log('Testing connection...');
  const connected = await client.testConnection();
  console.log('Connected:', connected);

  console.log('\nCreating User Story...');
  const workItem = await client.createWorkItem('User Story', {
    'System.Title': 'Test Story from trak-ado adapter',
    'System.Description': '<p>This work item was created via the <strong>trak Azure DevOps adapter</strong> to test bidirectional sync.</p>',
    'System.State': 'New'
  });

  console.log('\nWork Item Created:');
  console.log('  ID:', workItem.id);
  console.log('  Title:', workItem.fields['System.Title']);
  console.log('  State:', workItem.fields['System.State']);
  console.log('  URL:', workItem._links?.html?.href || workItem.url);

  return workItem;
}

main().catch(err => {
  console.error('Error:', err.message);
  if (err.response) {
    console.error('Response:', err.response);
  }
  process.exit(1);
});
