// Synthetic examples only; no production dataset is bundled in tests.
const image = (id, value) => ({ id, value, sourceUrl:'https://example.test/venue',
  sourceName:'Synthetic venue', sourceAddress:'Synthetic address',
  evidence:'Synthetic test evidence', matchStatus:'name_address_candidate', status:'candidate_not_approved' });
export default {
  generatedAt:'2026-01-01T00:00:00Z', snapshotAt:'2026-01-01T00:00:00Z',
  identities:[{id:'VN_0007',name:'Synthetic venue',address:'Synthetic address'}],
  totals:{image:{venues:2,candidates:3},phone:{venues:1,candidates:1},price_summary:{venues:1,candidates:1}},
  venues:{
    VN_0007:{image:[image('image-a','https://example.test/a.jpg'),image('image-b','https://example.test/b.jpg')],
      phone:[{...image('phone-a','0832012345'),sourceUrl:'https://sanpick.com/synthetic-test-only'}],
      price_summary:[{...image('price-a','100.000đ/h'),min:100000,max:100000,basis:'court_hour',unitMinutes:60}]},
    VN_0002:{image:[image('image-c','https://example.test/c.jpg')],phone:[],price_summary:[]},
  },
  coverage:{totalVenues:2,complete:1,missingAll:0,
    fields:{image:{venues:2,candidates:3,missing:0},phone:{venues:1,candidates:1,missing:1},price_summary:{venues:1,candidates:1,missing:1}},
    missing:[{id:'VN_0002',name:'Synthetic venue two',address:'Synthetic address',fields:['phone','price_summary']}]},
};
