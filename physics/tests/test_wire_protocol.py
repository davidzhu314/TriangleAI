import json

import pytest

from wire_protocol import WIRE_POINTS, ProtocolError, clamp_control, make_state, parse_client_message


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
