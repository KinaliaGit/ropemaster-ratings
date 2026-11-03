-- El rating de un participante va de 1 a 10. Solo agrega una restricción (los ratings nulos siguen permitidos).
alter table ropers
  add constraint ropers_rating_1_10 check (rating is null or (rating >= 1 and rating <= 10));
