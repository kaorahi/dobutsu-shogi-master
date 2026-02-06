# (ex.) make RULES=val1b

RULES = val1n
PRE = r_$(RULES)

.DELETE_ON_ERROR:

.PHONY: all build clean distclean analyze small large smalldocs largedocs docs update_rules images

all: largedocs

analyze: $(PRE)_2.txt

small: $(PRE)_unpruned_ai.txt.xz

large: $(PRE)_vals.xz

smalldocs: small update_rules
#	mkdir -p $(PUB)
	cp $(PRE)_unpruned_ai.txt.gz $(PUB)/
	rm -f $(PRE)_keys.gz $(PRE)_vals.gz $(PUB)/keys.gz $(PUB)/vals.gz
	rm -f $(PRE)_keys.xz $(PRE)_vals.xz $(PUB)/keys.xz $(PUB)/vals.xz
	make docs

largedocs: large update_rules
#	mkdir -p $(PUB)
	cp $(PRE)_keys.xz $(PUB)/keys.xz
	cp $(PRE)_vals.xz $(PUB)/vals.xz
	rm -f $(PRE)_unpruned_ai.txt.gz $(PUB)/unpruned_ai.txt.gz
	make docs

docs: images
	cd ../client && npm run build

images:
	cd ../client/images && cat ../src/public/rules.txt | xargs ruby setup.rb

OUT = target/release
LIB = src/board.rs src/board_collection.rs src/lib.rs

PUB = ../client/src/public

RULES_OPT = --rules=$(RULES)
XZ = xz

build:
	cargo build --release

clean:
	cargo clean
	rm -f r_?????_1.txt r_?????_2.txt r_?????_3.txt r_?????_2_cooked.txt
	rm -f r_?????T_1.txt r_?????T_2.txt r_?????T_3.txt r_?????T_2_cooked.txt

distclean: clean
	rm -f rules.txt r_?????_unpruned_ai.txt.gz
	rm -f rules.txt r_?????T_unpruned_ai.txt.gz
	rm -f r_?????_keys.gz r_?????_vals.gz
	rm -f r_?????_keys.xz r_?????_vals.xz
	rm -f r_?????T_keys.xz r_?????T_vals.xz

$(OUT)/1-enum: src/1-enum.rs $(LIB) build

$(OUT)/2-analyze: src/2-analyze.rs $(LIB) build

$(OUT)/3-extract: src/3-extract.rs $(LIB) build

$(PRE)_1.txt: $(OUT)/1-enum
	time $< $(RULES_OPT) > $@

$(PRE)_2.txt: $(OUT)/2-analyze $(PRE)_1.txt
	time $< $(RULES_OPT) < $(PRE)_1.txt > $@

$(PRE)_3.txt: $(OUT)/3-extract $(PRE)_2.txt
	time $< $(RULES_OPT) < $(PRE)_2.txt > $@

update_rules:
	mkdir -p $(PUB); echo '$(RULES)' > $(PUB)/rules.txt

$(PRE)_unpruned_ai.txt.gz: $(PRE)_3.txt
	time ruby -ne 'BEGIN {k = false}; k and puts $$_.split(":")[0]; k = ($$_ !~ /^\s|^$$/) and print $$_.split(/\s+/)[0..1].join(" ")' $< | gzip > $@

$(PRE)_2_cooked.txt: $(PRE)_2.txt
	time grep -v '[- ][0-3]$$' $< | time sort > $@

$(PRE)_keys.xz: $(PRE)_2_cooked.txt
#	time ruby -ne 'STDOUT.write([$$_.split[0].to_i(16)].pack("Q<"))' $< | $(XZ) > $@
	time ruby -ne 'BEGIN {$$p=0}; $$x=$$_.split[0].to_i(16); STDOUT.write([$$x-$$p].pack("Q<")); $$p=$$x' $< | $(XZ) > $@

$(PRE)_vals.xz: $(PRE)_2_cooked.txt $(PRE)_keys.xz
#	time ruby -ne 'STDOUT.write([$$_.split[1].to_i].pack("C"))' $< | $(XZ) > $@
	time ruby -ne 'STDOUT.write([$$_.split[1].to_i].pack("S"))' $< | $(XZ) > $@
