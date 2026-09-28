import {
  departmentDesignations,
  selectableMasters,
  shiftHours,
} from './weavingEmployeeMasterUtils';

describe('Weaving employee master form helpers', () => {
  const departments = [{ _id: 'weaving' }, { _id: 'sizing' }];
  const rows = [
    { _id: 'weaver', name: 'Weaver', departmentIds: [departments[0]._id], isActive: true },
    { _id: 'sizing', name: 'Sizing Operator', departmentIds: [departments[1]._id], isActive: true },
    { _id: 'legacy', name: 'Legacy Role', isActive: false, isDeleted: true },
  ];

  test('filters designations by department and preserves only the current legacy assignment', () => {
    expect(departmentDesignations(rows, 'weaving').map((row) => row._id)).toEqual(['weaver']);
    expect(departmentDesignations(rows, 'weaving', {
      departmentId: 'weaving',
      designationId: 'legacy',
    }).map((row) => row._id)).toEqual(['weaver', 'legacy']);
    expect(departmentDesignations(rows, 'sizing', {
      departmentId: 'weaving',
      designationId: 'legacy',
    }).map((row) => row._id)).toEqual(['sizing']);
  });

  test('keeps hidden masters only for an existing employee selection', () => {
    expect(selectableMasters(rows).map((row) => row._id)).toEqual(['weaver', 'sizing']);
    expect(selectableMasters(rows, 'legacy').map((row) => row._id)).toEqual(['weaver', 'sizing', 'legacy']);
  });

  test('calculates normal and overnight shift durations', () => {
    expect(shiftHours({ startTime: '08:00', endTime: '20:00' })).toBe(12);
    expect(shiftHours({ startTime: '20:00', endTime: '08:00' })).toBe(12);
    expect(shiftHours({ startTime: '', endTime: '08:00' })).toBe('');
  });
});
