'use strict';
/* =========================================================
   Built-in recipe library: typical ingredients for ONE serving
   of ~150 common café / restaurant / hotel / bakery dishes.
   Free, works offline. Amounts are a starting point — adjust them.
   Format: 'Dish name|other names|amount unit ingredient; …'
   ========================================================= */
const RECIPE_LIBRARY_SRC = [
  // ---- tea ----
  'Masala Chai|masala tea|100 ml milk; 10 g sugar; 5 g tea powder; 2 g ginger; 0.5 g tea masala',
  'Ginger Tea|adrak chai,adrak tea|100 ml milk; 10 g sugar; 5 g tea powder; 3 g ginger',
  'Cardamom Tea|elaichi chai,elaichi tea|100 ml milk; 10 g sugar; 5 g tea powder; 0.5 g cardamom',
  'Tea|chai,cutting chai,milk tea,regular tea|100 ml milk; 10 g sugar; 5 g tea powder',
  'Black Tea|kali chai,sulaimani|10 g sugar; 4 g tea powder',
  'Lemon Tea|lemon chai|10 g sugar; 3 g tea powder; 0.5 pcs lemon',
  'Green Tea||1 pcs green tea bag',
  'Iced Tea|ice tea|25 g sugar; 4 g tea powder; 0.5 pcs lemon',
  'Lemon Iced Tea|lemon ice tea|25 g sugar; 4 g tea powder; 1 pcs lemon',
  'Peach Iced Tea|peach ice tea|30 ml peach syrup; 4 g tea powder; 10 g sugar',
  'Kashmiri Kahwa|kahwa|3 g green tea; 0.5 g cardamom; 0.1 g saffron; 5 g almonds; 10 g sugar',
  'Herbal Tea||1 pcs herbal tea bag; 10 g honey',
  'Badam Milk|almond milk|200 ml milk; 15 g almonds; 20 g sugar; 0.1 g saffron',
  'Haldi Doodh|turmeric milk,haldi milk|200 ml milk; 2 g turmeric; 15 g sugar',
  'Bournvita|horlicks,boost|200 ml milk; 20 g bournvita; 10 g sugar',
  'Hot Milk|milk|200 ml milk; 15 g sugar',
  // ---- coffee ----
  'Espresso||18 g coffee beans',
  'Double Espresso||36 g coffee beans',
  'Americano||18 g coffee beans',
  'Cappuccino||18 g coffee beans; 150 ml milk; 10 g sugar',
  'Latte|cafe latte|18 g coffee beans; 220 ml milk; 10 g sugar',
  'Flat White||18 g coffee beans; 150 ml milk',
  'Mocha|cafe mocha|18 g coffee beans; 200 ml milk; 20 g chocolate syrup',
  'Macchiato||18 g coffee beans; 30 ml milk',
  'Caramel Latte|caramel macchiato|18 g coffee beans; 220 ml milk; 25 ml caramel syrup',
  'Hazelnut Latte||18 g coffee beans; 220 ml milk; 25 ml hazelnut syrup',
  'Vanilla Latte||18 g coffee beans; 220 ml milk; 25 ml vanilla syrup',
  'Filter Coffee|south indian coffee,kaapi,madras coffee|12 g filter coffee powder; 120 ml milk; 10 g sugar',
  'Coffee|hot coffee,milk coffee,nescafe|3 g coffee powder; 150 ml milk; 10 g sugar',
  'Black Coffee||3 g coffee powder; 10 g sugar',
  'Cold Coffee||4 g coffee powder; 200 ml milk; 25 g sugar; 1 scoop ice cream',
  'Iced Americano||18 g coffee beans',
  'Iced Latte||18 g coffee beans; 200 ml milk; 15 g sugar',
  'Cold Brew||20 g coffee beans',
  'Frappe|frappuccino,coffee frappe|4 g coffee powder; 150 ml milk; 25 g sugar; 30 g whipped cream',
  'Affogato||18 g coffee beans; 1 scoop vanilla ice cream',
  'Hot Chocolate|cocoa|200 ml milk; 20 g cocoa powder; 20 g sugar',
  // ---- shakes, juices, coolers ----
  'Chocolate Shake|chocolate milkshake|250 ml milk; 1 scoop chocolate ice cream; 30 ml chocolate syrup',
  'Vanilla Shake|vanilla milkshake|250 ml milk; 2 scoop vanilla ice cream; 15 g sugar',
  'Strawberry Shake|strawberry milkshake|250 ml milk; 1 scoop strawberry ice cream; 30 ml strawberry syrup',
  'Oreo Shake|oreo milkshake|250 ml milk; 1 scoop vanilla ice cream; 4 pcs oreo biscuits',
  'KitKat Shake|kitkat milkshake|250 ml milk; 1 scoop vanilla ice cream; 1 pcs kitkat',
  'Banana Shake|banana milkshake|250 ml milk; 1 pcs banana; 20 g sugar',
  'Mango Shake|mango milkshake|200 ml milk; 150 g mango; 20 g sugar',
  'Chikoo Shake|sapota shake|250 ml milk; 2 pcs chikoo; 20 g sugar',
  'Cold Drink|soft drink,coke,pepsi,sprite,thums up,fanta|1 pcs soft drink bottle',
  'Water Bottle|mineral water,bisleri|1 pcs water bottle',
  'Sweet Lassi|lassi|200 g curd; 25 g sugar; 30 ml milk',
  'Mango Lassi||150 g curd; 80 g mango; 20 g sugar',
  'Salted Lassi||200 g curd; 2 g salt',
  'Buttermilk|chaas,majjige,mattha|100 g curd; 2 g salt; 1 g cumin; 2 g coriander leaves',
  'Fresh Lime Soda|lime soda,nimbu soda|1 pcs lemon; 20 g sugar; 1 pcs soda bottle',
  'Fresh Lime Water|lemonade,nimbu pani,lime juice|1 pcs lemon; 25 g sugar; 1 g salt',
  'Mint Mojito|virgin mojito,mojito|1 pcs lemon; 5 g mint leaves; 25 g sugar; 1 pcs soda bottle',
  'Blue Lagoon||30 ml blue curacao syrup; 1 pcs lemon; 1 pcs soda bottle',
  'Orange Juice||400 g orange; 10 g sugar',
  'Watermelon Juice||400 g watermelon; 10 g sugar',
  'Pineapple Juice||300 g pineapple; 15 g sugar',
  'Mosambi Juice|sweet lime juice|400 g mosambi',
  'Apple Juice||300 g apple; 10 g sugar',
  'Carrot Juice||300 g carrot; 10 g sugar',
  'Sugarcane Juice||1 pcs lemon; 3 g ginger',
  'Mixed Fruit Juice|fruit juice|300 g mixed fruits; 15 g sugar',
  'Fruit Salad|fruit bowl|200 g mixed fruits',
  'Smoothie|fruit smoothie|150 g mixed fruits; 100 g curd; 15 g honey',
  'Falooda|royal falooda|200 ml milk; 30 ml rose syrup; 20 g falooda sev; 5 g sabja seeds; 1 scoop ice cream',
  // ---- breakfast: south indian ----
  'Masala Dosa||150 g dosa batter; 100 g potato; 20 g onion; 10 ml oil; 50 g chutney; 100 ml sambar',
  'Plain Dosa|sada dosa|150 g dosa batter; 10 ml oil; 50 g chutney; 100 ml sambar',
  'Set Dosa||180 g dosa batter; 10 ml oil; 50 g chutney',
  'Rava Dosa||60 g rava; 20 g rice flour; 15 ml oil; 20 g onion',
  'Onion Dosa||150 g dosa batter; 50 g onion; 10 ml oil',
  'Mysore Masala Dosa||150 g dosa batter; 100 g potato; 20 g red chutney; 15 g butter',
  'Ghee Roast Dosa||150 g dosa batter; 15 g ghee',
  'Benne Dosa|butter dosa|150 g dosa batter; 20 g butter',
  'Paper Dosa||180 g dosa batter; 15 ml oil',
  'Uttapam|onion uttapam|180 g dosa batter; 40 g onion; 20 g tomato; 10 ml oil',
  'Idli|idly|150 g idli batter; 50 g chutney; 100 ml sambar',
  'Vada|medu vada,uddina vada|60 g urad dal; 30 ml oil; 50 g chutney',
  'Idli Vada||100 g idli batter; 40 g urad dal; 20 ml oil; 100 ml sambar',
  'Sambar Vada||60 g urad dal; 30 ml oil; 150 ml sambar',
  'Upma|uppittu|60 g rava; 15 ml oil; 20 g onion',
  'Kesari Bath|sheera,rava kesari|50 g rava; 40 g sugar; 20 g ghee',
  'Khara Bath||70 g rava; 15 ml oil; 30 g mixed vegetables',
  'Pongal|ven pongal|60 g rice; 20 g moong dal; 15 g ghee',
  'Poha|avalakki|70 g poha; 20 g onion; 10 g peanuts; 10 ml oil',
  'Bisi Bele Bath||70 g rice; 30 g toor dal; 50 g mixed vegetables; 10 g ghee',
  'Puri Bhaji|poori masala,poori|80 g atta; 100 g potato; 30 ml oil',
  // ---- breakfast: other ----
  'Aloo Paratha||80 g atta; 100 g potato; 15 g butter',
  'Paneer Paratha||80 g atta; 60 g paneer; 15 g butter',
  'Gobi Paratha||80 g atta; 80 g cauliflower; 15 g butter',
  'Plain Paratha|paratha,lachha paratha|80 g atta; 15 g ghee',
  'Chole Bhature|chole bhatura|100 g maida; 80 g chickpeas; 40 ml oil; 20 g onion',
  'Pav Bhaji||2 pcs pav; 150 g mixed vegetables; 50 g potato; 20 g butter; 20 g onion',
  'Vada Pav||1 pcs pav; 80 g potato; 30 g besan; 20 ml oil',
  'Misal Pav||2 pcs pav; 80 g sprouts; 30 g farsan; 20 g onion; 15 ml oil',
  'Omelette|omelet,masala omelette|2 pcs egg; 20 g onion; 10 ml oil',
  'Cheese Omelette||2 pcs egg; 1 slices cheese; 10 g butter',
  'Boiled Eggs|boiled egg|2 pcs egg',
  'Egg Bhurji|scrambled eggs|3 pcs egg; 30 g onion; 20 g tomato; 10 ml oil',
  'Bread Omelette||2 pcs egg; 2 slices bread; 10 g butter',
  'Bread Butter|bread and butter|2 slices bread; 15 g butter',
  'Bread Jam||2 slices bread; 20 g jam',
  'Butter Toast|toast|2 slices bread; 15 g butter',
  'French Toast||2 slices bread; 1 pcs egg; 50 ml milk; 10 g sugar; 10 g butter',
  'Pancakes|pancake|80 g maida; 1 pcs egg; 100 ml milk; 15 g sugar; 10 g butter',
  'Waffle|waffles|80 g maida; 1 pcs egg; 100 ml milk; 15 g sugar; 15 g butter',
  'Oats|oatmeal,porridge|50 g oats; 200 ml milk; 10 g sugar',
  'English Breakfast|full breakfast|2 pcs egg; 2 slices bread; 2 pcs sausage; 50 g baked beans; 10 g butter',
  // ---- sandwiches, burgers, rolls ----
  'Veg Sandwich|vegetable sandwich|2 slices bread; 30 g cucumber; 30 g tomato; 10 g butter; 10 g green chutney',
  'Grilled Sandwich|veg grilled sandwich|2 slices bread; 40 g mixed vegetables; 1 slices cheese; 15 g butter',
  'Cheese Sandwich|cheese grilled sandwich|2 slices bread; 2 slices cheese; 10 g butter',
  'Paneer Sandwich|paneer tikka sandwich|2 slices bread; 60 g paneer; 10 g butter; 10 g mayonnaise',
  'Club Sandwich||3 slices bread; 1 pcs egg; 1 slices cheese; 30 g tomato; 20 g mayonnaise; 10 g butter',
  'Chicken Sandwich|chicken grilled sandwich|2 slices bread; 80 g chicken; 15 g mayonnaise; 10 g butter',
  'Egg Sandwich||2 slices bread; 2 pcs egg; 15 g mayonnaise',
  'Corn Sandwich|corn cheese sandwich|2 slices bread; 50 g sweet corn; 1 slices cheese; 10 g butter',
  'Bombay Sandwich|masala toast sandwich|2 slices bread; 50 g potato; 20 g cucumber; 20 g tomato; 15 g butter',
  'Veg Burger|aloo tikki burger|1 pcs burger bun; 1 pcs veg patty; 20 g lettuce; 20 g tomato; 15 g mayonnaise',
  'Cheese Burger||1 pcs burger bun; 1 pcs veg patty; 1 slices cheese; 20 g lettuce; 15 g mayonnaise',
  'Chicken Burger||1 pcs burger bun; 1 pcs chicken patty; 20 g lettuce; 15 g mayonnaise',
  'Paneer Burger||1 pcs burger bun; 80 g paneer; 20 g lettuce; 15 g mayonnaise',
  'Hot Dog|hotdog|1 pcs hot dog bun; 1 pcs sausage; 15 g ketchup',
  'Veg Roll|veg wrap,veg frankie,kathi roll|1 pcs roti; 80 g mixed vegetables; 20 g onion; 10 ml oil',
  'Paneer Roll|paneer wrap,paneer frankie|1 pcs roti; 80 g paneer; 20 g onion; 10 ml oil',
  'Chicken Roll|chicken wrap,chicken frankie|1 pcs roti; 100 g chicken; 20 g onion; 10 ml oil',
  'Egg Roll||1 pcs roti; 2 pcs egg; 20 g onion; 10 ml oil',
  // ---- snacks, fast food ----
  'French Fries|fries,finger chips|150 g french fries; 40 ml oil; 2 g salt',
  'Peri Peri Fries||150 g french fries; 40 ml oil; 3 g peri peri masala',
  'Cheese Fries||150 g french fries; 40 ml oil; 40 g cheese sauce',
  'Potato Wedges||150 g potato; 30 ml oil',
  'Samosa||40 g maida; 60 g potato; 30 ml oil',
  'Kachori||40 g maida; 30 g moong dal; 30 ml oil',
  'Onion Pakoda|onion bhaji,kanda bhaji,pakora|60 g onion; 40 g besan; 40 ml oil',
  'Mirchi Bajji|mirchi bhaji|2 pcs green chilli; 40 g besan; 40 ml oil',
  'Paneer Pakoda||80 g paneer; 30 g besan; 30 ml oil',
  'Bread Pakoda||2 slices bread; 40 g besan; 50 g potato; 40 ml oil',
  'Veg Cutlet|cutlet|80 g potato; 40 g mixed vegetables; 20 g bread crumbs; 30 ml oil',
  'Spring Roll|veg spring roll|2 pcs spring roll sheets; 60 g cabbage; 20 g carrot; 40 ml oil',
  'Nachos|nachos with cheese|60 g nachos; 40 g cheese sauce; 20 g salsa',
  'Garlic Bread||2 pcs garlic bread; 15 g butter; 3 g garlic',
  'Cheese Garlic Bread||2 pcs garlic bread; 15 g butter; 30 g mozzarella cheese',
  'Pani Puri|golgappa,puchka|6 pcs puri; 40 g potato; 150 ml pani masala water',
  'Bhel Puri|bhel|50 g puffed rice; 20 g sev; 20 g onion; 20 g tomato; 15 g chutney',
  'Sev Puri||6 pcs puri; 40 g potato; 20 g sev; 15 g chutney',
  'Dahi Puri||6 pcs puri; 60 g curd; 30 g potato; 15 g chutney',
  'Pav|bun pav|1 pcs pav',
  'Maggi|instant noodles|1 pcs maggi; 10 g butter',
  'Cheese Maggi||1 pcs maggi; 1 slices cheese; 10 g butter',
  'Veg Maggi||1 pcs maggi; 40 g mixed vegetables; 10 g butter',
  // ---- chinese / indo-chinese ----
  'Veg Fried Rice|fried rice|90 g rice; 50 g mixed vegetables; 15 ml oil; 5 ml soy sauce',
  'Egg Fried Rice||90 g rice; 2 pcs egg; 15 ml oil; 5 ml soy sauce',
  'Chicken Fried Rice||90 g rice; 80 g chicken; 1 pcs egg; 15 ml oil; 5 ml soy sauce',
  'Schezwan Fried Rice||90 g rice; 50 g mixed vegetables; 15 ml oil; 20 g schezwan sauce',
  'Veg Noodles|hakka noodles,chow mein|100 g noodles; 60 g mixed vegetables; 15 ml oil; 5 ml soy sauce',
  'Chicken Noodles||100 g noodles; 80 g chicken; 15 ml oil; 5 ml soy sauce',
  'Schezwan Noodles||100 g noodles; 60 g mixed vegetables; 15 ml oil; 20 g schezwan sauce',
  'Gobi Manchurian|gobi manchuri|150 g cauliflower; 30 g cornflour; 40 ml oil; 10 ml soy sauce',
  'Veg Manchurian||120 g mixed vegetables; 30 g cornflour; 40 ml oil; 10 ml soy sauce',
  'Chilli Paneer|paneer chilli|120 g paneer; 20 g cornflour; 40 g capsicum; 30 g onion; 25 ml oil; 10 ml soy sauce',
  'Chilli Chicken|chicken chilli|150 g chicken; 25 g cornflour; 40 g capsicum; 30 g onion; 30 ml oil; 10 ml soy sauce',
  'Chicken Manchurian||150 g chicken; 25 g cornflour; 30 ml oil; 10 ml soy sauce',
  'Paneer Manchurian||120 g paneer; 20 g cornflour; 30 ml oil; 10 ml soy sauce',
  'Baby Corn Manchurian|baby corn chilli|120 g baby corn; 25 g cornflour; 30 ml oil; 10 ml soy sauce',
  'Mushroom Chilli|chilli mushroom|150 g mushroom; 20 g cornflour; 30 ml oil; 10 ml soy sauce',
  'Momos|veg momos,dumplings|80 g maida; 80 g cabbage; 20 g carrot; 30 g momo chutney',
  'Chicken Momos||80 g maida; 100 g chicken; 20 g onion; 30 g momo chutney',
  'Fried Momos||80 g maida; 80 g cabbage; 40 ml oil',
  'Manchow Soup||60 g mixed vegetables; 10 g cornflour; 5 ml soy sauce; 20 g noodles; 10 ml oil',
  'Hot and Sour Soup|hot n sour soup|60 g mixed vegetables; 10 g cornflour; 5 ml soy sauce; 5 ml vinegar',
  'Sweet Corn Soup|corn soup|60 g sweet corn; 10 g cornflour; 20 g mixed vegetables',
  'Tomato Soup||200 g tomato; 10 g butter; 10 g cream',
  'Chicken Soup|chicken clear soup|80 g chicken; 30 g mixed vegetables; 10 g cornflour',
  // ---- north indian curries ----
  'Paneer Butter Masala|paneer makhani,butter paneer|120 g paneer; 100 g tomato; 20 g butter; 30 ml cream; 20 g onion; 10 g cashew',
  'Kadai Paneer|kadhai paneer|120 g paneer; 50 g capsicum; 40 g onion; 60 g tomato; 20 ml oil',
  'Palak Paneer|saag paneer|100 g paneer; 150 g spinach; 20 g onion; 15 ml oil; 10 ml cream',
  'Paneer Tikka|paneer tikka dry|150 g paneer; 40 g curd; 30 g capsicum; 30 g onion; 10 ml oil',
  'Paneer Tikka Masala||120 g paneer; 40 g curd; 80 g tomato; 30 g onion; 20 ml oil; 20 ml cream',
  'Shahi Paneer||120 g paneer; 30 ml cream; 15 g cashew; 30 g onion; 20 g butter',
  'Matar Paneer|mutter paneer|100 g paneer; 60 g green peas; 60 g tomato; 30 g onion; 15 ml oil',
  'Paneer Bhurji||120 g paneer; 30 g onion; 30 g tomato; 15 ml oil',
  'Mix Veg|mixed vegetable curry,veg curry|180 g mixed vegetables; 30 g onion; 50 g tomato; 20 ml oil',
  'Veg Kolhapuri||180 g mixed vegetables; 30 g onion; 50 g tomato; 25 ml oil; 10 g coconut',
  'Aloo Gobi||120 g potato; 120 g cauliflower; 30 g onion; 20 ml oil',
  'Jeera Aloo||200 g potato; 3 g cumin; 20 ml oil',
  'Dum Aloo||200 g potato; 40 g curd; 30 g onion; 25 ml oil',
  'Bhindi Masala|bhindi fry,okra|200 g ladies finger; 40 g onion; 20 ml oil',
  'Baingan Bharta||250 g brinjal; 40 g onion; 40 g tomato; 20 ml oil',
  'Malai Kofta||100 g paneer; 60 g potato; 30 ml cream; 15 g cashew; 30 ml oil',
  'Chana Masala|chole,chickpea curry|80 g chickpeas; 40 g onion; 60 g tomato; 20 ml oil',
  'Rajma|rajma masala|80 g rajma; 40 g onion; 60 g tomato; 20 ml oil',
  'Dal Tadka|dal fry,yellow dal,dal|70 g toor dal; 30 g onion; 30 g tomato; 10 g ghee',
  'Dal Makhani||70 g urad dal; 10 g rajma; 20 g butter; 20 ml cream; 50 g tomato',
  'Dal Palak||60 g toor dal; 80 g spinach; 10 g ghee',
  'Kadhi|kadhi pakoda|150 g curd; 30 g besan; 10 ml oil',
  'Butter Chicken|chicken makhani,murgh makhani|200 g chicken; 100 g tomato; 25 g butter; 30 ml cream; 10 g cashew',
  'Chicken Curry|chicken masala|200 g chicken; 60 g onion; 60 g tomato; 25 ml oil',
  'Chicken Tikka||200 g chicken; 50 g curd; 10 ml oil; 5 g ginger garlic paste',
  'Chicken Tikka Masala||180 g chicken; 50 g curd; 80 g tomato; 40 g onion; 25 ml oil; 20 ml cream',
  'Kadai Chicken|kadhai chicken|200 g chicken; 50 g capsicum; 50 g onion; 60 g tomato; 25 ml oil',
  'Tandoori Chicken|tandoori|250 g chicken; 60 g curd; 10 ml oil; 5 g tandoori masala',
  'Chicken 65||200 g chicken; 25 g cornflour; 40 ml oil; 10 g curd',
  'Chicken Kebab|seekh kebab,chicken seekh|200 g chicken; 20 g onion; 10 ml oil',
  'Chicken Lollipop||6 pcs chicken lollipop; 30 g cornflour; 50 ml oil',
  'Mutton Curry|mutton masala|200 g mutton; 60 g onion; 60 g tomato; 30 ml oil',
  'Mutton Rogan Josh|rogan josh|200 g mutton; 50 g curd; 50 g onion; 30 ml oil',
  'Fish Curry||200 g fish; 50 g onion; 50 g tomato; 30 g coconut; 25 ml oil',
  'Fish Fry|tawa fish,fried fish|200 g fish; 20 g rice flour; 30 ml oil',
  'Prawns Masala|prawn curry,prawns curry|180 g prawns; 50 g onion; 50 g tomato; 25 ml oil',
  'Egg Curry|anda curry,egg masala|2 pcs egg; 50 g onion; 60 g tomato; 20 ml oil',
  // ---- rice & biryani ----
  'Veg Biryani|vegetable biryani|120 g basmati rice; 100 g mixed vegetables; 30 g onion; 30 g curd; 15 g ghee',
  'Paneer Biryani||120 g basmati rice; 100 g paneer; 30 g onion; 30 g curd; 15 g ghee',
  'Chicken Biryani|chicken dum biryani|130 g basmati rice; 200 g chicken; 40 g onion; 40 g curd; 20 g ghee',
  'Mutton Biryani||130 g basmati rice; 200 g mutton; 40 g onion; 40 g curd; 20 g ghee',
  'Egg Biryani||130 g basmati rice; 2 pcs egg; 40 g onion; 30 g curd; 15 g ghee',
  'Hyderabadi Biryani|dum biryani|130 g basmati rice; 200 g chicken; 40 g onion; 50 g curd; 20 g ghee',
  'Veg Pulao|pulao|100 g basmati rice; 60 g mixed vegetables; 10 g ghee',
  'Jeera Rice||100 g basmati rice; 3 g cumin; 10 g ghee',
  'Steamed Rice|plain rice,white rice,rice|100 g rice',
  'Curd Rice|mosaru anna,thayir sadam|80 g rice; 150 g curd; 5 ml oil',
  'Lemon Rice|chitranna|100 g rice; 0.5 pcs lemon; 10 g peanuts; 10 ml oil',
  'Tomato Rice|tomato bath|100 g rice; 80 g tomato; 15 ml oil',
  'Ghee Rice||100 g basmati rice; 20 g ghee; 10 g cashew',
  'Khichdi|khichadi|70 g rice; 30 g moong dal; 10 g ghee',
  'Veg Thali|thali,veg meals,meals|150 g rice; 2 pcs roti; 50 g toor dal; 100 g mixed vegetables; 50 g curd',
  'Mini Meals|south indian meals|150 g rice; 100 ml sambar; 100 ml rasam; 50 g curd',
  'Chicken Thali|non veg thali|150 g rice; 2 pcs roti; 150 g chicken; 50 g toor dal',
  // ---- breads ----
  'Butter Naan||80 g maida; 10 g curd; 10 g butter',
  'Garlic Naan||80 g maida; 10 g curd; 10 g butter; 3 g garlic',
  'Naan|plain naan|80 g maida; 10 g curd',
  'Cheese Naan||80 g maida; 30 g mozzarella cheese; 10 g butter',
  'Tandoori Roti||70 g atta',
  'Butter Roti||70 g atta; 8 g butter',
  'Roti|chapati,phulka|40 g atta',
  'Kulcha|amritsari kulcha|80 g maida; 50 g potato; 10 g butter',
  'Rumali Roti||60 g maida',
  'Missi Roti||40 g atta; 30 g besan',
  'Parotta|kerala parotta,malabar parotta|90 g maida; 15 ml oil',
  // ---- pizza, pasta, continental ----
  'Margherita Pizza|margarita pizza,cheese pizza|1 pcs pizza base; 50 g pizza sauce; 100 g mozzarella cheese',
  'Veg Pizza|farmhouse pizza,veggie pizza|1 pcs pizza base; 50 g pizza sauce; 80 g mozzarella cheese; 60 g mixed vegetables',
  'Paneer Pizza|paneer tikka pizza|1 pcs pizza base; 50 g pizza sauce; 80 g mozzarella cheese; 60 g paneer',
  'Corn Pizza|corn cheese pizza|1 pcs pizza base; 50 g pizza sauce; 80 g mozzarella cheese; 50 g sweet corn',
  'Chicken Pizza|bbq chicken pizza|1 pcs pizza base; 50 g pizza sauce; 80 g mozzarella cheese; 80 g chicken',
  'Pepperoni Pizza||1 pcs pizza base; 50 g pizza sauce; 80 g mozzarella cheese; 50 g pepperoni',
  'White Sauce Pasta|alfredo pasta,penne alfredo|100 g pasta; 100 ml milk; 15 g butter; 10 g maida; 30 g cheese',
  'Red Sauce Pasta|arrabiata pasta,arrabbiata|100 g pasta; 80 g pasta sauce; 15 ml oil; 10 g cheese',
  'Pink Sauce Pasta|mix sauce pasta|100 g pasta; 50 g pasta sauce; 60 ml milk; 10 g butter; 20 g cheese',
  'Pesto Pasta||100 g pasta; 30 g pesto; 15 ml olive oil; 10 g cheese',
  'Chicken Pasta||100 g pasta; 80 g chicken; 80 g pasta sauce; 10 g cheese',
  'Spaghetti|spaghetti bolognese|100 g spaghetti; 80 g pasta sauce; 15 ml olive oil',
  'Mac and Cheese|mac n cheese|100 g pasta; 100 ml milk; 50 g cheese; 10 g butter',
  'Lasagna|lasagne|80 g lasagna sheets; 80 g pasta sauce; 80 g mozzarella cheese; 50 ml milk',
  'Caesar Salad||80 g lettuce; 20 g croutons; 20 g caesar dressing; 10 g cheese',
  'Green Salad|salad|50 g cucumber; 50 g tomato; 30 g onion; 0.5 pcs lemon',
  'Greek Salad||50 g cucumber; 50 g tomato; 30 g feta cheese; 15 ml olive oil',
  'Grilled Chicken||200 g chicken; 15 ml olive oil; 5 g garlic',
  'Fish and Chips|fish n chips|150 g fish; 150 g french fries; 40 g maida; 50 ml oil',
  // ---- bakery & desserts ----
  'Croissant|butter croissant|1 pcs croissant',
  'Chocolate Croissant|pain au chocolat|1 pcs croissant; 20 g chocolate',
  'Chocolate Cake|chocolate pastry|40 g maida; 35 g sugar; 20 g butter; 1 pcs egg; 10 g cocoa powder; 20 g chocolate',
  'Black Forest Cake|black forest pastry|40 g maida; 35 g sugar; 1 pcs egg; 40 g whipped cream; 10 g cherries',
  'Red Velvet Cake|red velvet pastry|40 g maida; 35 g sugar; 20 g butter; 1 pcs egg; 30 g cream cheese',
  'Pineapple Cake|pineapple pastry|40 g maida; 35 g sugar; 1 pcs egg; 40 g whipped cream; 20 g pineapple',
  'Vanilla Cake|vanilla pastry,sponge cake|40 g maida; 35 g sugar; 20 g butter; 1 pcs egg',
  'Cheesecake|blueberry cheesecake|60 g cream cheese; 20 g sugar; 30 g biscuits; 15 g butter',
  'Brownie|chocolate brownie|30 g maida; 35 g sugar; 25 g butter; 1 pcs egg; 25 g chocolate',
  'Sizzling Brownie|brownie with ice cream|1 pcs brownie; 1 scoop vanilla ice cream; 30 ml chocolate sauce',
  'Muffin|cupcake|35 g maida; 25 g sugar; 15 g butter; 0.5 pcs egg; 30 ml milk',
  'Cookie|cookies|25 g maida; 15 g sugar; 15 g butter; 10 g chocolate chips',
  'Donut|doughnut|50 g maida; 15 g sugar; 10 g butter; 30 ml oil; 15 g chocolate',
  'Puff|veg puff,egg puff,chicken puff|50 g puff pastry; 40 g mixed vegetables',
  'Cinnamon Roll||60 g maida; 20 g sugar; 15 g butter; 2 g cinnamon',
  'Bun|sweet bun|1 pcs bun',
  'Ice Cream|ice cream scoop|2 scoop ice cream',
  'Sundae|hot fudge sundae|2 scoop ice cream; 30 ml chocolate sauce; 10 g nuts',
  'Gulab Jamun||2 pcs gulab jamun',
  'Rasgulla|rasagulla|2 pcs rasgulla',
  'Rasmalai||2 pcs rasmalai',
  'Gajar Halwa|carrot halwa|150 g carrot; 100 ml milk; 30 g sugar; 15 g ghee',
  'Kheer|payasam,rice kheer|30 g rice; 200 ml milk; 30 g sugar; 5 g dry fruits',
  'Kulfi|matka kulfi|1 pcs kulfi',
  'Jalebi||100 g jalebi',
  'Custard|fruit custard|200 ml milk; 15 g custard powder; 25 g sugar; 50 g mixed fruits',
];
// "1 scoop" and "1 slices" are counted as pieces by the ingredient reader
const RECIPE_LIBRARY = RECIPE_LIBRARY_SRC.map((line) => {
  const [n, alias, ing] = line.split('|');
  return { name: n, names: [n, ...alias.split(',').filter(Boolean)], ing: ing.split(';').map((x) => x.trim().replace(/^(\d+(?:\.\d+)?) scoop /, '$1 pcs ')) };
});

const dishWords = (s) => String(s || '').toLowerCase().replace(/\bidly\b/g, 'idli').replace(/&/g, ' and ').replace(/\bn\b/g, 'and').replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean).map((w) => w.replace(/(ies)$/, 'y').replace(/([^s])s$/, '$1'));
/** Find the library dish for a menu item name: every word of a library name must appear; the longest name wins */
function findDish(name) {
  const words = dishWords(name); if (!words.length) return null;
  let best = null, score = 0;
  RECIPE_LIBRARY.forEach((d) => d.names.forEach((n) => {
    const w = dishWords(n);
    if (!w.length || !w.every((x) => words.includes(x))) return;
    const sc = w.length * 10 + (w.length === words.length ? 5 : 0) + (n === d.name ? 1 : 0);
    if (sc > score) { score = sc; best = d; }
  }));
  return best;
}
/** Library ingredients for a dish as reader items: { name, amount (ml / g / pcs), kind, raw } */
function libraryItems(dish) { return (dish?.ing || []).map((l) => parseLine(l)).filter(Boolean); }
/** Library recipe using only stock items you already have (for automatic filling) */
function libraryRecipe(name, stock = S.stock) {
  const out = [];
  libraryItems(findDish(name)).forEach((it) => {
    const s = matchStock(it.name, stock); if (!s || out.some((o) => o.stockId === s.id)) return;
    const q = amountFor(s, it.amount, it.kind); if (q == null) return;
    out.push({ stockId: s.id, qty: r6(convertUnit(q, handyUnit(s.unit), s.unit) ?? q) });
  });
  return out;
}

/* ---------------- free AI helper (Cloudflare Worker, see worker/README.md) ---------------- */
async function aiCall(route, body) {
  if (!window.AI_URL) throw new Error('AI is not set up yet');
  const user = typeof Cloud !== 'undefined' ? Cloud.auth?.currentUser : null;
  if (!user) throw new Error('please log in online first');
  const res = await fetch(`${String(window.AI_URL).replace(/\/+$/, '')}/${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `error ${res.status}`);
  return data;
}

/* ---------------- buttons in the dish form ---------------- */
const dishName = (el) => el.closest('form')?.name?.value.trim() || '';
Object.assign(Actions, {
  libFill(el) {
    const name = dishName(el);
    if (!name) return toast('Type the dish name first.');
    const d = findDish(name);
    if (!d) {
      showPanel(true);
      $('#imp-status').textContent = `"${name}" is not in the recipe library yet.${window.AI_URL ? ' Try "Ask AI",' : ' Try'} "Search on Google" or "Paste ingredients".`;
      $('#imp-preview').innerHTML = '';
      return;
    }
    showPanel(true);
    $('#imp-status').textContent = d.name.toLowerCase() === name.toLowerCase() ? '' : `Closest dish in the library: ${d.name}`;
    showItems(libraryItems(d), `Recipe library · ${d.name} · typical amounts for one serving`);
  },
  async aiFill(el) {
    const name = dishName(el);
    if (!name) return toast('Type the dish name first.');
    if (!window.AI_URL) return toast('AI is not set up for this café yet.');
    showPanel(true);
    const status = $('#imp-status'); $('#imp-preview').innerHTML = '';
    status.textContent = `Asking AI for the ingredients of one ${name}…`;
    el.disabled = true;
    try {
      const data = await aiCall('recipe', { dish: name.slice(0, 80), business: S.settings?.type || 'cafe', stock: S.stock.map((s) => s.name).slice(0, 200) });
      const KIND = { ml: 'vol', g: 'wt', pcs: 'count' };
      const items = (data.ingredients || []).filter((x) => x && x.name && KIND[x.unit] && x.amount > 0).slice(0, 25)
        .map((x) => ({ name: String(x.name).slice(0, 40), amount: +x.amount, kind: KIND[x.unit], raw: `${x.amount} ${x.unit} ${x.name}` }));
      status.textContent = data.note ? `AI: ${String(data.note).slice(0, 160)}` : '';
      showItems(items, `AI suggestion · ${name} · one serving`);
    } catch (e) {
      status.textContent = `AI could not answer right now (${e.message}). Try "Recipe library" or "Search on Google".`;
    } finally { el.disabled = false; }
  },
});
