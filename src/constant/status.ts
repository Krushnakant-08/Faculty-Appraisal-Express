// Multi-choice label options for status
export const STAKEHOLDER_STATUS = [
	{ label: 'Active', value: 'active' },
	{ label: 'Inactive', value: 'inactive' },
];

export type StakeholderStatus = typeof STAKEHOLDER_STATUS[number]["value"];