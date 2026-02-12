export const DEPARTMENT = [
    { label: 'Computer Engineering', value: 'computer' },
    { label: 'Mechanical Engineering', value: 'mechanical' },
    { label: 'Electrical Engineering', value: 'electrical' },
    { label: 'Civil Engineering', value: 'civil' },
]

export type DepartmentValue = typeof DEPARTMENT[number]["value"];