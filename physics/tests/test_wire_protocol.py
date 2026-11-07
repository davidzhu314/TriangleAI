import json

import pytest

from wire_protocol import WIRE_POINTS, ProtocolError, clamp_control, make_state, parse_client_message, ras_mm_to_yup_m


def test_spec_client_messages_round_trip():
    for msg in (
        {"type": "start", "phantom": "phantom3", "target": "bca", "preset": "standard_j"},
        {"type": "control", "push": 0.6, "rotate": -0.2},
        {"type": "stop"},
    ):
        assert parse_client_message(json.loads(json.dumps(msg))) == msg


def test_controls_are_clamped():
    assert parse_client_message({"type": "control", "push": 3, "rotate": -9}) == {
        "type": "control",
        "push": 1.0,
        "rotate": -1.0,
    }
    assert clamp_control(float("nan")) == 0.0


@pytest.mark.parametrize(
    "msg",
    [
        {"type": "start", "phantom": "phantom9", "target": "bca", "preset": "standard_j"},
        {"type": "start", "phantom": "phantom3", "target": "rcca", "preset": "standard_j"},
        {"type": "start", "phantom": "phantom3", "target": "bca", "preset": ""},
        {"type": "teleport"},
    ],
)
def test_bad_messages_are_rejected(msg):
    with pytest.raises(ProtocolError):
        parse_client_message(msg)


def test_state_message_matches_spec_shape():
    wire = [[0.0, i * 0.001, 0.0] for i in range(WIRE_POINTS)]
    state = make_state(12.48, wire, 0.42, False)
    assert set(state) == {"type", "t", "wire", "tip", "contact_force_n", "at_target"}
    assert state["type"] == "state"
    assert len(state["wire"]) == WIRE_POINTS
    assert state["tip"] == wire[-1]
    json.dumps(state)


def test_ras_to_yup_matches_the_client_contract():
    # Same vectors as client/src/contracts/contracts.test.ts.
    assert ras_mm_to_yup_m([0, 0, 1000]) == [0.0, 1.0, 0.0]
    assert ras_mm_to_yup_m([-1000, 0, 0]) == [1.0, 0.0, 0.0]
    assert ras_mm_to_yup_m([0, 1000, 0]) == [0.0, 0.0, 1.0]
    assert ras_mm_to_yup_m([12, -40, 250]) == [-0.012, 0.25, -0.04]


def test_cathsim_to_ras_mm_puts_superior_on_s_and_patient_right_on_r():
    from wire_protocol import cathsim_m_to_ras_mm

    # CathSim +y is superior, +x patient left, +z anterior.
    assert cathsim_m_to_ras_mm([0.0, 0.1, 0.0]) == [0.0, 0.0, 100.0]
    assert cathsim_m_to_ras_mm([0.01, 0.0, 0.0]) == [-10.0, 0.0, 0.0]
    assert cathsim_m_to_ras_mm([0.0, 0.0, 0.02]) == [0.0, 20.0, 0.0]


def test_cathsim_frame_round_trips_to_the_client_frame():
    from wire_protocol import cathsim_m_to_ras_mm, ras_mm_to_yup_m

    for p in ([0.0, 0.0, 0.0], [-0.043272, 0.136586, 0.034102], [0.0179, -0.0214, 0.0713]):
        q = ras_mm_to_yup_m(cathsim_m_to_ras_mm(p))
        assert all(abs(a - b) < 1e-12 for a, b in zip(q, p))
