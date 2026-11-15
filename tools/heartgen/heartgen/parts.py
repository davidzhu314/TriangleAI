"""The parts a heart GLB can hold: mesh name, group, and the words the Heart tab shows (stored in glTF extras).

Colours are not here: the viewer maps each mesh name to a design token (client/src/heart/parts.ts).
"""
from __future__ import annotations

from dataclasses import dataclass

GROUPS = ["chambers", "myocardium", "great_vessels", "valves", "subvalvular"]


@dataclass(frozen=True)
class Part:
    name: str
    group: str
    display_name: str
    description: str


PARTS = {p.name: p for p in [
    Part("lv_myocardium", "myocardium", "Left ventricle wall",
         "The thick muscle of the left ventricle, including the septum it shares with the right ventricle. It pumps blood to the whole body and forms the apex."),
    Part("rv_wall", "myocardium", "Right ventricle wall",
         "The thinner muscle of the right ventricle. It wraps the front and right of the left ventricle and pumps blood to the lungs."),
    Part("la", "chambers", "Left atrium",
         "The chamber at the back of the heart. It receives blood from the lungs through four pulmonary veins and passes it to the left ventricle."),
    Part("ra", "chambers", "Right atrium",
         "The chamber on the right side. It receives blood from the body through the superior and inferior venae cavae and passes it to the right ventricle."),
    Part("aorta", "great_vessels", "Aorta",
         "The main artery. It leaves the left ventricle heading up and to the right, carrying blood to the body."),
    Part("pulmonary_trunk", "great_vessels", "Pulmonary trunk",
         "The artery that leaves the right ventricle, crosses in front of the aorta and carries blood to the lungs."),
    # M0 only: the template's flat valve planes mark where each valve sits. M2 replaces them with leaflets.
    Part("mv_plane", "valves", "Mitral valve (position only)",
         "Where the mitral valve sits, between the left atrium and left ventricle. A flat marker from the template; leaflets are not modelled yet."),
    Part("tv_plane", "valves", "Tricuspid valve (position only)",
         "Where the tricuspid valve sits, between the right atrium and right ventricle. A flat marker from the template; leaflets are not modelled yet."),
    Part("av_plane", "valves", "Aortic valve (position only)",
         "Where the aortic valve sits, between the left ventricle and the aorta. A flat marker from the template; cusps are not modelled yet."),
    Part("pv_plane", "valves", "Pulmonary valve (position only)",
         "Where the pulmonary valve sits, between the right ventricle and the pulmonary trunk. A flat marker from the template; cusps are not modelled yet."),
]}
