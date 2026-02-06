#!/usr/bin/env ruby

# utility for debugging
# (ex.) The last line represents hands.
# echo 'gl.\n.e.\n...\nELG\ncC' | tee /dev/stderr | ./encode.rb

# piece codes (same as board.ts)
PIECE = {
  "." => 0,
  "L" => 1,
  "E" => 2,
  "G" => 3,
  "C" => 4,
  "H" => 5,
  "l" => 9,
  "e" => 10,
  "g" => 11,
  "c" => 12,
  "h" => 13,
}

# board: array of 4 strings (top -> bottom), each length 3
# hands: hash like {"C"=>1, "E"=>0, "G"=>0, "c"=>1, "e"=>0, "g"=>0}
def encode(board, hands)
  cells = 0

  # x = 0..2 (left to right)
  # y = 0..3 (bottom to top)
  (0..2).each do |x|
    (0..3).each do |y|
      ch = board[3 - y][x]
      code = PIECE[ch]
      raise "unknown piece #{ch}" unless code
      i = x * 4 + y
      cells |= (code << (i * 4))
    end
  end

  # hands: 2 bits each
  # lower 6 bits: own (E,G,C)
  # upper 6 bits: opponent (e,g,c)
  h = 0
  h |= (hands.fetch("E", 0) & 3) << 0
  h |= (hands.fetch("G", 0) & 3) << 2
  h |= (hands.fetch("C", 0) & 3) << 4
  h |= (hands.fetch("e", 0) & 3) << 6
  h |= (hands.fetch("g", 0) & 3) << 8
  h |= (hands.fetch("c", 0) & 3) << 10

  value = cells + (h << (12 * 4))
  value.to_s(16).rjust(15, "0")
end

board = ARGF.readlines.map{|s| s.chomp}
hands = board.pop.chars.tally
# hands = board.pop.chars.tally.transform_keys(&:to_sym)

a = encode(board, hands)
b = encode(board.map{|s| s.reverse}, hands)
puts(a < b ? a : b)
