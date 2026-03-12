export const DEPARTMENT = [
    { label: 'Computer Engineering', value: 'computer' },
    { label: 'Information Technology', value: 'it' },
    { label: 'Mechanical Engineering', value: 'mechanical' },
    { label: 'Civil Engineering', value: 'civil' },
    { label: 'Electronics and Telecommunication Engineering', value: 'entc' },
    { label: 'Computer Engineering (Regional)', value: 'computer_regional' },
    { label: 'Artificial Intelligence and Machine Learning', value: 'aiml' },
    { label: 'Applied Sciences and Humanities', value: 'ash' },
    { label: 'PCCOE - Institute Level', value: 'pccoe' },
]

export type DepartmentValue = typeof DEPARTMENT[number]["value"];