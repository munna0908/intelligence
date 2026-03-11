[coco]
version = "0.7.1-rc.2"

[module]
name = "Intelligence"
version = "1.0.0"
license = ["MIT"]
repository = "https://github.com/intelligence/participant-intelligence-service"
authors = ["Participant Intelligence Team"]

[target]
os = "MOI"
arch = "PISA"

[target.moi]
format = "JSON"
output = "intelligence"

[target.pisa]
format = "ASM"
version = "0.6.0"

[lab.render]
big_int_as_hex = true
bytes_as_hex = false

[lab.config.default]
env = "main"

[scripts]
build = "coco compile"
clean = "rm -rf ./build"
