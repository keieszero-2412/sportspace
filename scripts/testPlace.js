import fs from 'fs';

const GOOGLE_API_KEY = "AIzaSyBvLJvPwSAZ2IoG0D_FkCTmwrSe6pJ91Zk"; // Using the key from firebaseConfig
const query = "Bunne Pickleball Home Sài Đồng";

async function test() {
  const url1 = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery&fields=photos,name&key=${GOOGLE_API_KEY}`;
  const url2 = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${GOOGLE_API_KEY}`;

  console.log("FindPlace:");
  let res = await fetch(url1);
  let data = await res.json();
  console.log(JSON.stringify(data, null, 2));

  console.log("\nTextSearch:");
  res = await fetch(url2);
  data = await res.json();
  if (data.results && data.results.length > 0) {
     console.log("Name:", data.results[0].name);
     console.log("Photos:", data.results[0].photos ? "Yes" : "No");
  } else {
     console.log("No results");
  }
}
test();
