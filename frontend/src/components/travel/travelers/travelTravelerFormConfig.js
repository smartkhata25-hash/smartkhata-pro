export const emptyTravelerForm = {
  fullName: '',
  fatherOrHusbandName: '',
  gender: '',
  dateOfBirth: '',
  nationality: '',
  cnic: '',
  passportNumber: '',
  passportIssueDate: '',
  passportExpiryDate: '',
  passportCountry: '',
  mobile: '',
  email: '',
  notes: '',
  isActive: true,
};

export const emptyQuickTraveler = { fullName: '', passportNumber: '', mobile: '' };

export const travelerFields = [
  { name: 'fullName', labelKey: 'travel.fields.fullName', placeholderKey: 'travel.placeholders.fullName', required: true },
  { name: 'fatherOrHusbandName', labelKey: 'travel.fields.fatherOrHusbandName', placeholderKey: 'travel.placeholders.fatherOrHusbandName' },
  { name: 'gender', labelKey: 'travel.fields.gender', type: 'select', placeholderKey: 'travel.placeholders.gender', options: [
    { value: 'male', labelKey: 'travel.gender.male' },
    { value: 'female', labelKey: 'travel.gender.female' },
    { value: 'other', labelKey: 'travel.gender.other' },
  ] },
  { name: 'dateOfBirth', labelKey: 'travel.fields.dateOfBirth', type: 'date' },
  { name: 'nationality', labelKey: 'travel.fields.nationality', placeholderKey: 'travel.placeholders.nationality' },
  { name: 'cnic', labelKey: 'travel.fields.cnic', placeholderKey: 'travel.placeholders.cnic' },
  { name: 'passportNumber', labelKey: 'travel.fields.passportNumber', placeholderKey: 'travel.placeholders.passportNumber' },
  { name: 'passportCountry', labelKey: 'travel.fields.passportCountry', placeholderKey: 'travel.placeholders.passportCountry' },
  { name: 'passportIssueDate', labelKey: 'travel.fields.passportIssueDate', type: 'date' },
  { name: 'passportExpiryDate', labelKey: 'travel.fields.passportExpiryDate', type: 'date' },
  { name: 'mobile', labelKey: 'travel.fields.mobile', placeholderKey: 'travel.placeholders.mobile' },
  { name: 'email', labelKey: 'travel.fields.email', placeholderKey: 'travel.placeholders.email', type: 'email' },
  { name: 'notes', labelKey: 'travel.fields.notes', placeholderKey: 'travel.placeholders.notes', type: 'textarea', fullWidth: true },
  { name: 'isActive', labelKey: 'travel.fields.isActive', type: 'checkbox', fullWidth: true },
];

export const quickTravelerFields = travelerFields.filter((field) =>
  ['fullName', 'passportNumber', 'mobile'].includes(field.name)
);

const normalizeDateForInput = (value) => (value ? String(value).slice(0, 10) : '');

export const prepareTravelerForm = (traveler = null) => ({
  ...emptyTravelerForm,
  ...traveler,
  dateOfBirth: normalizeDateForInput(traveler?.dateOfBirth),
  passportIssueDate: normalizeDateForInput(traveler?.passportIssueDate),
  passportExpiryDate: normalizeDateForInput(traveler?.passportExpiryDate),
  isActive: traveler?.isActive !== false,
});

export const cleanTravelerPayload = (values) => ({
  ...values,
  dateOfBirth: values.dateOfBirth || null,
  passportIssueDate: values.passportIssueDate || null,
  passportExpiryDate: values.passportExpiryDate || null,
});
