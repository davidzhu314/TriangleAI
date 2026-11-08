"""D5 physics process: CathSim behind the spec §5.2 WebSocket, plus HTTP case serving. Localhost only.

    MUJOCO_GL=disable .venv/bin/python -m server          # from physics/, port 8765

- `session.py`: one drive, paced in simulation time (no CathSim import; tested in CI with a fake).
- `cathsim_backend.py`: the CathSim wire (the only module that imports CathSim).
- `app.py`: WebSocket `/wire` and HTTP `/cases/...` on one port.
"""
