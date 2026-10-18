import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterTasks, periodEnd } from '../src/taskFilters.ts';
const task=(id,date,completed=false,list_id=null)=>({id,title:id,notes:'',priority:'normal',due_date:date,completed,list_id});
const data=[task('late','2026-09-30'),task('today','2026-10-14'),task('tomorrow','2026-10-15'),task('undated',null),task('old-done','2026-09-30',true),task('done','2026-10-14',true)];
test('day includes overdue open tasks, not future/undated/old completed',()=>{assert.deepEqual(filterTasks(data,'2026-10-14','day','all','all').map(t=>t.id),['late','today','done']);});
test('week begins Monday, ends Sunday and includes overdue tasks',()=>{assert.equal(periodEnd('2026-10-14','week'),'2026-10-18');assert.equal(periodEnd('2026-10-18','week'),'2026-10-18');assert.deepEqual(filterTasks(data,'2026-10-14','week','all','open').map(t=>t.id),['late','today','tomorrow']);});
test('month handles leap year and December',()=>{assert.equal(periodEnd('2024-02-10','month'),'2024-02-29');assert.equal(periodEnd('2026-12-14','month'),'2026-12-31');});
test('all includes undated; list and completion filters compose',()=>{assert.equal(filterTasks(data,'2026-10-14','all','none','open').length,4);assert.deepEqual(filterTasks([task('a',null,false,'l'),task('b',null,true,'l')],'2026-10-14','all','l','done').map(t=>t.id),['b']);});
