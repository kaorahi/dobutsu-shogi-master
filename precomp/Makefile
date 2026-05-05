# (ex.) make RULES=val1b

RULES = val1n
PRE = r_$(RULES)

.DELETE_ON_ERROR:

.PHONY: all build clean distclean analyze large largedocs docs docs_only update_rules images test

all: largedocs

analyze: $(PRE)_2.txt

large: $(PRE)_vals.xz

largedocs: large update_rules
#	mkdir -p $(PUB)
	cp $(PRE)_keys.xz $(PUB)/keys.xz
	cp $(PRE)_vals.xz $(PUB)/vals.xz
	make docs

docs: images docs_only

docs_only:
	cd ../client && npm run build

images:
	cd ../client/images && cat ../src/public/rules.txt | xargs ruby setup.rb

OUT = target/release
LIB = src/board.rs src/board_collection.rs src/lib.rs

PUB = ../client/src/public

RULES_OPT = --rules=$(RULES)
XZ = xz

test:
	cd ../client && npm test

build:
	cargo build --release

clean: longcycle_clean
	cargo clean
	rm -f r_?????_1.txt r_?????_2.txt r_?????_2_cooked.txt
	rm -f r_?????T_1.txt r_?????T_2.txt r_?????T_2_cooked.txt

distclean: clean longcycle_distclean
	rm -f r_?????_keys.gz r_?????_vals.gz
	rm -f r_?????_keys.xz r_?????_vals.xz
	rm -f r_?????T_keys.xz r_?????T_vals.xz

$(OUT)/1-enum: src/1-enum.rs $(LIB) build

$(OUT)/2-analyze: src/2-analyze.rs $(LIB) build

$(PRE)_1.txt: $(OUT)/1-enum
	time $< $(RULES_OPT) > $@

$(PRE)_2.txt: $(OUT)/2-analyze $(PRE)_1.txt
	time $< $(RULES_OPT) < $(PRE)_1.txt > $@

update_rules:
	mkdir -p $(PUB); echo '$(RULES)' > $(PUB)/rules.txt

$(PRE)_2_cooked.txt: $(PRE)_2.txt
	time grep -v '[- ][0-3]$$' $< | time sort > $@

$(PRE)_keys.xz: $(PRE)_2_cooked.txt
#	time ruby -ne 'STDOUT.write([$$_.split[0].to_i(16)].pack("Q<"))' $< | $(XZ) > $@
	time ruby -ne 'BEGIN {$$p=0}; $$x=$$_.split[0].to_i(16); STDOUT.write([$$x-$$p].pack("Q<")); $$p=$$x' $< | $(XZ) > $@

$(PRE)_vals.xz: $(PRE)_2_cooked.txt $(PRE)_keys.xz
#	time ruby -ne 'STDOUT.write([$$_.split[1].to_i].pack("C"))' $< | $(XZ) > $@
	time ruby -ne 'STDOUT.write([$$_.split[1].to_i].pack("S"))' $< | $(XZ) > $@

##################################################
# Search for a long cycle (Sen-Nichi-Te)

.PHONY: longcycle longcycle_clean longcycle_distclean

longcycle: $(PRE)_longcycle_5.txt $(PRE)_longcycle_9.txt

longcycle_clean:
	rm -f r_?????_longcycle_1.txt
	rm -f r_?????_longcycle_2.txt
	rm -f r_?????_longcycle_3.txt
	rm -f r_?????_longcycle_4.txt
	rm -f r_?????_longcycle_5.txt
	rm -f r_?????_longcycle_6.txt
	rm -f r_?????_longcycle_7.txt
	rm -f r_?????T_longcycle_1.txt
	rm -f r_?????T_longcycle_2.txt
	rm -f r_?????T_longcycle_3.txt
	rm -f r_?????T_longcycle_4.txt
	rm -f r_?????T_longcycle_5.txt
	rm -f r_?????T_longcycle_6.txt
	rm -f r_?????T_longcycle_7.txt

longcycle_distclean: longcycle_clean
	rm -f r_?????_longcycle_8.txt
	rm -f r_?????_longcycle_9.txt
	rm -f r_?????T_longcycle_8.txt
	rm -f r_?????T_longcycle_9.txt

$(OUT)/longcycle_1-next: src/longcycle_1-next.rs $(LIB) build

$(OUT)/longcycle_2-node2comp: src/longcycle_2-node2comp.rs $(LIB) build

$(OUT)/longcycle_6-asymmetric: src/longcycle_6-asymmetric.rs $(LIB) build

$(OUT)/longcycle_8-cycle: src/longcycle_8-cycle.rs $(LIB) build

# node => nodes
$(PRE)_longcycle_1.txt: $(OUT)/longcycle_1-next $(PRE)_2.txt
	time $< $(RULES_OPT) < $(PRE)_2.txt > $@

# node => comp
$(PRE)_longcycle_2.txt: $(OUT)/longcycle_2-node2comp $(PRE)_longcycle_1.txt
	time $< < $(PRE)_longcycle_1.txt > $@

# comp => nodes
$(PRE)_longcycle_3.txt: $(PRE)_longcycle_2.txt
	time ruby -lane 'h ||= Hash.new{|hh,k| hh[k]=[]}; h[$$F[1]] << $$F[0]; END{h.each{|k,v| puts ([k] + v).join(" ")}}' $< > $@

# DAG (comp => comps)
$(PRE)_longcycle_4.txt: $(PRE)_longcycle_1.txt $(PRE)_longcycle_2.txt
	time ruby -e 'r=Hash.new{|rr,k| rr[k]=Set.new}; h=Hash.new; IO.foreach(ARGV[1]){|l| a=l.split; h[a[0]]=a[1]}; IO.foreach(ARGV[0]){|l| a=l.split; y0=h[a[0]]; s=r[y0]; a[1..].each{|x| y=h[x]; s.add y unless y==y0}}; r.each{|k,v| puts ([k]+v.to_a).join " "}' $(PRE)_longcycle_1.txt $(PRE)_longcycle_2.txt > $@

# rev DAG (comp => comps)
$(PRE)_longcycle_5.txt: $(PRE)_longcycle_4.txt
	time ruby -lane 'h ||= Hash.new{|hh,k| hh[k]=[]}; h[$$F[0]]; $$F[1..].each{|c| h[c] << $$F[0]}; END {h.each{|k,v| puts ([k]+v).join(" ")}}' $< > $@

# nodes in the largest component
$(PRE)_longcycle_6.txt: $(PRE)_longcycle_3.txt
	time ruby -lane 'champ||=[]; champ=$$F if $$F.length > champ.length; END {puts champ[1..].join("\n")}' $< > $@

# the largest component (node => nodes)
$(PRE)_longcycle_7.txt: $(PRE)_longcycle_1.txt $(PRE)_longcycle_6.txt
	time ruby -e 's=Set.new(IO.foreach(ARGV[1]).map{|l| l.chomp}); IO.foreach(ARGV[0]){|l| a=l.split; s.include?(b=a[0]) and puts ([b]+a[1..].filter{|x| s.include?(x)}).join " "}' $(PRE)_longcycle_1.txt $(PRE)_longcycle_6.txt > $@

# long cycles (logs)
$(PRE)_longcycle_8.txt: $(OUT)/longcycle_8-cycle $(PRE)_longcycle_7.txt
	time $< < $(PRE)_longcycle_7.txt > $@

# longest cycle (nodes)
$(PRE)_longcycle_9.txt: $(PRE)_longcycle_8.txt
	time fgrep -A 1000000000 "`fgrep '===' $< | tail -n 1`" $< | tail -n +2 > $@
