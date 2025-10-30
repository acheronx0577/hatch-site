import { HttpClient } from '../../../packages/sdk-lite/src/client';

async function main() {
  const client = new HttpClient({ baseUrl: 'https://example.com' });

  const contactsApi = await import('../../../packages/sdk-lite/src/apis/ContactsApi');
  const dealDeskApi = await import('../../../packages/sdk-lite/src/apis/DealDeskApi');
  const payoutsApi = await import('../../../packages/sdk-lite/src/apis/PayoutsApi');

  const ContactsApi = contactsApi.ContactsApi;
  const DealDeskApi = dealDeskApi.DealDeskApi;
  const PayoutsApi = payoutsApi.PayoutsApi;

  const contacts = new ContactsApi(client);
  const dealDesk = new DealDeskApi(client);
  const payouts = new PayoutsApi(client);

  if (typeof contacts.get_contacts !== 'function') {
    throw new Error('ContactsApi missing get_contacts method');
  }
  if (typeof dealDesk.get_deal_desk_requests !== 'function') {
    throw new Error('DealDeskApi missing get_deal_desk_requests method');
  }
  if (typeof payouts.get_payouts !== 'function') {
    throw new Error('PayoutsApi missing get_payouts method');
  }

  console.log('[sdk-smoke] SDK methods available');
}

main().catch((error) => {
  console.error('[sdk-smoke] failed:', error);
  process.exit(1);
});
