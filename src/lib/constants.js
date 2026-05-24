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

// Per-person profile (drives strength benchmark scaling).
export const PROFILES = {
  ethan:  { name: 'Ethan',  bodyweight_kg: 74.8, height_cm: 180, age: 27, sex: 'male' },
  justin: { name: 'Justin', bodyweight_kg: 80.0, height_cm: 178, age: 28, sex: 'male' }
}
export const profileFor = (user) => PROFILES[user] || PROFILES.ethan
export const bwLbFor = (user) => profileFor(user).bodyweight_kg * 2.20462

// Back-compat exports — default to Ethan if no user passed.
export const PROFILE = PROFILES.ethan
export const PROFILE_BW_LB = PROFILE.bodyweight_kg * 2.20462
