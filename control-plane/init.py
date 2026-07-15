import os
crates = ["api", "controllers", "events", "persistence", "providers", "reconciler", "observability", "config", "workflows"]
os.chdir("/Users/vibrantceo/Projects/portals/cloud/control-plane")
for c in crates:
    os.makedirs(f"{c}/src", exist_ok=True)
    with open(f"{c}/Cargo.toml", "w") as f:
        f.write(f"""[package]
name = "{c}"
version = "0.1.0"
edition = "2021"

[dependencies]
tokio = {{ workspace = true }}
async-trait = {{ workspace = true }}
serde = {{ workspace = true }}
serde_json = {{ workspace = true }}
tracing = {{ workspace = true }}
anyhow = {{ workspace = true }}
thiserror = {{ workspace = true }}
chrono = {{ workspace = true }}
futures = {{ workspace = true }}
uuid = {{ workspace = true }}
""")
    if c == "api":
        with open(f"{c}/Cargo.toml", "a") as f:
            f.write("axum = \"0.7\"\n")
            f.write("controllers = { path = \"../controllers\" }\n")
            f.write("providers = { path = \"../providers\" }\n")
            f.write("events = { path = \"../events\" }\n")
            f.write("persistence = { path = \"../persistence\" }\n")
            f.write("reconciler = { path = \"../reconciler\" }\n")
            f.write("observability = { path = \"../observability\" }\n")
            f.write("config = { path = \"../config\" }\n")
        with open(f"{c}/src/main.rs", "w") as f:
            f.write("fn main() { println!(\"Control Plane API\"); }\n")
    else:
        with open(f"{c}/src/lib.rs", "w") as f:
            f.write("pub fn init() {}\n")

# Extra internal dependencies
def add_dep(crate, dep):
    with open(f"{crate}/Cargo.toml", "a") as f:
        f.write(f"{dep} = {{ path = \"../{dep}\" }}\n")

add_dep("controllers", "providers")
add_dep("controllers", "events")
add_dep("controllers", "persistence")
add_dep("controllers", "reconciler")
add_dep("controllers", "observability")
add_dep("controllers", "workflows")

add_dep("providers", "observability")

add_dep("reconciler", "events")
add_dep("reconciler", "observability")

add_dep("persistence", "events")

add_dep("workflows", "events")
add_dep("workflows", "persistence")
