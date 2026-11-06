import { assertEquals } from 'jsr:@std/assert@1';
import { filterVisibleProducts, heldProducts, isArchivedProduct, isCompanySeat } from '../src/lib/productVisibility.ts';

const seat = { id: 'seat', name: 'English All Skills (company seat)', status: 'active', metadata: { slug: 'english-company-seat', kind: 'company_seat', hidden: true } };
const teaching = { id: 'teaching', name: 'Schood Teaching', status: 'active', metadata: { kind: 'institution_service', hidden: true } };
const ielts = { id: 'ielts', name: 'IELTS Simulator', status: 'active', metadata: { slug: 'ielts' } };
const products = [seat, teaching, ielts];
const row = (resource_id: string | null, resource_type = 'product') => ({ id: `e-${resource_id}`, resource_type, resource_id, ends_at: '2027-01-01T00:00:00Z' });

Deno.test('someone whose only access is a hidden company seat sees it, with its end date', () => {
  const held = heldProducts([row('seat')], products);
  assertEquals(held.map((item) => [item.product.id, item.entitlement.ends_at]), [['seat', '2027-01-01T00:00:00Z']]);
  assertEquals(isCompanySeat(held[0].product), true);
});

Deno.test('hidden products stay out of what can be browsed, and offer no plans', () => {
  assertEquals(filterVisibleProducts(products).map((product) => product.id), ['ielts']);
  assertEquals([isArchivedProduct(seat), isArchivedProduct(teaching), isArchivedProduct(ielts)], [true, true, false]);
  assertEquals(isCompanySeat(teaching), false);
});

Deno.test('only products the person holds are shown: nothing hidden appears without an entitlement', () => {
  assertEquals(heldProducts([], products), []);
  assertEquals(heldProducts([row('ielts')], products).map((item) => item.product.id), ['ielts']);
  assertEquals(heldProducts([row('seat'), row('ielts')], products).map((item) => item.product.id), ['seat', 'ielts']);
  assertEquals(heldProducts([row('not-loaded'), row(null), row('seat', 'course')], products), []);
});
