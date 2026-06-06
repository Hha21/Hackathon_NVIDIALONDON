"""Lewisham ward + station geography.

Single source of truth for ward -> coordinates. The join key with Person A's
real forecast is `ward_name` (A's clean data emits ward *names*, e.g.
"Lewisham Central", not ONS codes). `ward_id` is a code-like stable string
for the API contract; it is NOT the join key.

When A delivers the real forecast, every ward_name it emits must exist here so
we can attach lat/lon. Update WARDS if A uses names not listed.
"""

# ward_name -> (ward_id, lat, lon)
# Coordinates are approximate ward centroids around Lewisham, SE London.
WARDS = {
    "Lewisham Central": ("E05009317", 51.462, -0.010),
    "Brockley":         ("E05009322", 51.464, -0.036),
    "Blackheath":       ("E05009320", 51.466,  0.009),
    "Deptford":         ("E05009312", 51.478, -0.026),
    "Evelyn":           ("E05009314", 51.487, -0.038),
    "Ladywell":         ("E05009316", 51.455, -0.020),
    "Rushey Green":     ("E05009325", 51.445, -0.015),
    "Telegraph Hill":   ("E05009327", 51.474, -0.043),
    "Forest Hill":      ("E05009315", 51.439, -0.053),
    "Sydenham":         ("E05009326", 51.427, -0.052),
    "Perry Vale":       ("E05009324", 51.435, -0.050),
    "Catford South":    ("E05009311", 51.438, -0.020),
}

# station_name -> (lat, lon)
STATIONS = {
    "Lewisham":    (51.461, -0.012),
    "Deptford":    (51.479, -0.026),
    "New Cross":   (51.476, -0.036),
    "Forest Hill": (51.439, -0.053),
    "Lee Green":   (51.451,  0.012),
}

# Incident type vocabulary shared with the frontend filter and Person A.
# "all" is the filter sentinel, not a stored value.
INCIDENT_TYPES = [
    "dwelling_fire",
    "outdoor_fire",
    "false_alarm",
    "road_traffic_collision",
]

DEMO_DISTRICT = "Lewisham"


def ward_meta(ward_name: str):
    """Return (ward_id, lat, lon) for a ward name, or None if unknown."""
    return WARDS.get(ward_name)


def nearest_stations(lat: float, lon: float):
    """Stations ordered nearest-first by squared planar distance (good enough
    at city scale). Used by scenario logic to pick a pre-position origin."""
    def d2(s):
        slat, slon = STATIONS[s]
        return (slat - lat) ** 2 + (slon - lon) ** 2
    return sorted(STATIONS.keys(), key=d2)
