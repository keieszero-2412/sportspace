import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { transform } from 'esbuild';
const source = fs.readFileSync(new URL('../src/components/AdminPanel.jsx',import.meta.url),'utf8')
  .replace(/^import[^\n]*\n/gm,'').replace(/^const VenueDataReview = .*\n/m,'').replace('export default function','function');
const {code} = await transform(source,{loader:'jsx'});
test('admin contains only the focused venue review, no merchant or bank subscriptions', () => {
  const Selector=()=>null;
  const Component=new Function('React','AsyncStatus','VenueDataReview',`${code};return AdminPanel;`)(React,()=>null,Selector);
  const nodes=value=>Array.isArray(value)?value.flatMap(nodes):React.isValidElement(value)?[value,...nodes(value.props.children)]:[];
  const tree=nodes(Component({lang:'vi'}));
  assert.equal(tree.filter(node=>node.type===Selector).length,1);
  assert.equal(tree.find(node=>node.type===Selector).props.focused,true);
  assert.doesNotMatch(source,/watch\(|MerchantApplications|verifyBank|approveMerchant|localStorage/);
});
