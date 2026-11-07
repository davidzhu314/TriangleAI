# Puts physics/ on sys.path so tests can import the bridge modules.
# The CathSim checkout and the local venv are not ours to test.
collect_ignore = ["vendor", ".venv", "probe"]
