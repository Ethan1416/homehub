// Two-person household. Change names/colors here.
export const PEOPLE = {
  ethan: { label: 'Ethan', color: '#7c9cff' },
  justin: { label: 'Justin', color: '#5fd0a0' },
  shared: { label: 'Shared', color: '#ffb454' }
}

export const MACHINES = {
  mac: { label: "Ethan's Mac", owner: 'ethan' },
  pc: { label: "Justin's PC", owner: 'justin' }
}

export const ownerColor = (owner) => (PEOPLE[owner] || PEOPLE.shared).color
export const ownerLabel = (owner) => (PEOPLE[owner] || PEOPLE.shared).label

// Lifter profile (from Oura account). Drives strength benchmark scaling.
export const PROFILE = {
  bodyweight_kg: 74.8,
  height_cm: 180,
  age: 27,
  sex: 'male'
}
export const PROFILE_BW_LB = PROFILE.bodyweight_kg * 2.20462
