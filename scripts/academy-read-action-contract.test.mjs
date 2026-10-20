import {test} from 'node:test';
import assert from 'node:assert/strict';
import {academyDispatchedReadActions} from './lib/academy-read-action-contract.mjs';
test('single and combined read branches remain explicit dispatcher contracts',()=>{
 const source=`const handleReadAction=async(action)=>{if(action==='contacts'||action==='classrooms'||action==='classroom-memberships')return currentDirectory(action);if('summary'===action)return summary();}`;
 assert.deepEqual([...academyDispatchedReadActions(source)].sort(),['classroom-memberships','classrooms','contacts','summary']);
});
test('comments, allowed-name lists and unrelated functions cannot satisfy a missing read route',()=>{
 const source=`const other=()=>{if(action==='contacts')return data;};const handleReadAction=async(action)=>{// if(action==='contacts')\nconst allowed=['contacts'];if(action==='summary')return data;};`;
 assert.deepEqual([...academyDispatchedReadActions(source)],['summary']);
});
